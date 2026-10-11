// First run: try the demo, or connect a private GitHub repository as the vault.
import { h, icon, toast, confirmDialog } from '../dom.js';
import { zk, saveConfig, loadConfig } from '../../zk.js';
import { GitHubRemote } from '../../store/github.js';
import { GUIDE_URL } from './settings.js';

export function welcomeView(ctx) {
  ctx.layout = 'bare';
  ctx.static = true;
  ctx.title = 'Welcome';
  const page = h('div', { class: 'page welcome' });
  const cfg = loadConfig();

  const intro = h('div', { class: 'welcome-hero' },
    h('img', { src: 'icons/icon.svg', alt: '', width: 72, height: 72 }),
    h('h1', null, 'Slip-box'),
    h('p', { class: 'lead' }, 'A Zettelkasten for your phone: capture thoughts in seconds, turn them into small notes in your own words, and link them so ideas grow.'));

  const tryDemo = async () => {
    saveConfig({ mode: 'demo' });
    location.hash = '#/';
    location.reload();
  };

  const connectForm = buildConnectForm();
  const showConnect = ctx.query.connect === '1';

  page.append(
    intro,
    cfg && cfg.mode !== 'demo' ? h('p', { class: 'card' }, 'You are connected. ', h('a', { href: '#/' }, 'Go to your notes')) : null,
    h('div', { class: 'welcome-choices' },
      h('div', { class: 'card choice-card' },
        h('h2', null, 'Try it first'),
        h('p', null, 'Explore with about 30 sample notes. Everything stays in this browser; nothing is uploaded.'),
        h('button', { class: 'btn big', onclick: tryDemo }, icon('eye'), h('span', null, 'Try with sample notes'))),
      h('div', { class: 'card choice-card' },
        h('h2', null, 'Use it for real'),
        h('p', null, 'Keep your notes in your own private GitHub repository: synced to all your devices, versioned on every save, and backed up every night.'),
        showConnect ? null : h('button', { class: 'btn big primary', onclick: () => { connectForm.hidden = false; connectForm.querySelector('input').focus(); } }, icon('link'), h('span', null, 'Connect my vault')))),
    connectForm,
  );
  connectForm.hidden = !showConnect;
  return page;
}

function buildConnectForm() {
  const repo = h('input', { class: 'input', type: 'text', placeholder: 'your-name/my-notes', autocapitalize: 'none', autocorrect: 'off', spellcheck: false, 'aria-label': 'Repository' });
  const token = h('input', { class: 'input', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', 'aria-label': 'Access token' });
  const samples = h('input', { type: 'checkbox' });
  const status = h('p', { class: 'small', role: 'status' });
  const go = h('button', { class: 'btn primary big', type: 'submit' }, icon('check'), h('span', null, 'Connect'));

  const form = h('form', { class: 'card connect-form', onsubmit: async (e) => {
    e.preventDefault();
    const m = /^\s*(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?\s*$/.exec(repo.value);
    if (!m) return (status.textContent = 'Enter the repository as owner/name, e.g. jane/my-notes.');
    if (!token.value.trim()) return (status.textContent = 'Paste your access token.');
    go.disabled = true;
    status.textContent = 'Checking…';
    try {
      const remote = new GitHubRemote({ token: token.value.trim(), owner: m[1], repo: m[2] });
      const info = await remote.connect();
      if (!info.permissions?.push) throw new Error('The token can read this repository but not save to it. Give it “Contents: Read and write” permission.');
      if (!info.private) {
        const ok = await confirmDialog('This repository is PUBLIC: anyone on the internet could read your notes. Make it private on GitHub (Settings → General → Danger Zone → Change visibility) before continuing. Continue anyway?', { ok: 'Continue anyway', danger: true });
        if (!ok) throw new Error('Connection cancelled. Make the repository private, then try again.');
      }
      const cfg = { mode: 'github', owner: info.owner.login, repo: info.name, branch: info.default_branch, token: token.value.trim() };
      saveConfig(cfg);
      await zk.start(cfg);
      status.textContent = 'Connected. Setting up the vault…';
      const { vaultStatus, installVault } = await import('../../services/setup.js');
      const vs = await vaultStatus();
      if (!vs.initialized) {
        await installVault({ samples: samples.checked, onProgress: (msg) => (status.textContent = msg) });
      }
      status.textContent = 'All set!';
      toast('Connected to your vault');
      location.hash = '#/';
      location.reload();
    } catch (err) {
      go.disabled = false;
      status.textContent = err.message;
      status.className = 'small warn';
    }
  } },
    h('h2', null, 'Connect your GitHub vault'),
    h('ol', { class: 'steps' },
      h('li', null, 'Create a free account at github.com if you don’t have one.'),
      h('li', null, 'Create a new ', h('strong', null, 'private'), ' repository, for example “my-notes”.'),
      h('li', null, 'Create a fine-grained access token for that repository only, with these permissions set to “Read and write”: ', h('em', null, 'Contents, Actions, Workflows'), '.'),
      h('li', null, 'Paste both below. ', h('a', { href: GUIDE_URL, target: '_blank', rel: 'noopener' }, 'Step-by-step guide with pictures'), '.')),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Repository (owner/name)'), repo),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Access token'), token),
    h('label', { class: 'check' }, samples, h('span', null, 'Also add the ~30 sample notes (you can delete them later)')),
    h('p', { class: 'muted small' }, 'The token is stored only on this device and sent only to GitHub. Anyone with your unlocked phone could use it, so keep a screen lock on.'),
    go,
    status);
  return form;
}
