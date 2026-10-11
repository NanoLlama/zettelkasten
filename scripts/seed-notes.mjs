// The sample vault: ~30 notes that demonstrate every note type, links, tags, sources and
// attachments, and double as a short guide to the Zettelkasten method.
// Edit here, then run `npm run seed` to regenerate seed/vault/ and web/seed.json.

export const ATTACHMENTS = {
  // filled in by build-seed.mjs: name -> { hash, size, kind }
};

const S_AHRENS = '202609010900';
const S_KADAVY = '202609010905';
const S_STICK = '202609010910';

const L_FLEETING = '202609031015';
const L_PAPER = '202609031040';
const L_DIGITAL = '202609041930';
const L_RETRIEVAL = '202609052100';
const L_INTERLEAVE = '202609052130';

const P_CONNECT = '202609061000';
const P_OWNWORDS = '202609061020';
const P_ATOMIC = '202609061045';
const P_REMINDERS = '202609061110';
const P_BOTTOMUP = '202609071000';
const P_LINKTHINK = '202609071030';
const P_RETRIEVAL = '202609081000';
const P_SPACING = '202609081030';
const P_INTERLEAVE = '202609081100';
const P_DESIRABLE = '202609081130';
const P_WRITING = '202609091000';
const P_ELABORATE = '202609091030';
const P_FLUENCY = '202609091100';
const P_INDEXNOTES = '202609101000';
const P_NOBLANK = '202609101030';

const I_START = '202609120900';
const I_LEARNING = '202609120930';
const I_METHOD = '202609121000';

const PR_ESSAY = '202609150900';

export function notes(att) {
  const img = (name) => `![${name}](attachment:${att[name].hash})`;
  const at = (name) => ({ hash: att[name].hash, name, kind: att[name].kind, size: att[name].size });
  return [
    // ---- sources ----
    { id: S_AHRENS, title: 'How to Take Smart Notes', type: 'source', tags: ['zettelkasten', 'writing'],
      extra: { source_kind: 'book', author: 'Sönke Ahrens', year: '2017', publisher: 'CreateSpace' },
      body: 'The book that popularised Niklas Luhmann’s slip-box method for students and writers.\n' },
    { id: S_KADAVY, title: 'Digital Zettelkasten', type: 'source', tags: ['zettelkasten'],
      extra: { source_kind: 'book', author: 'David Kadavy', year: '2021', publisher: 'Kadavy, Inc.' },
      body: 'A short guide to running a Zettelkasten in software.\n' },
    { id: S_STICK, title: 'Make It Stick', type: 'source', tags: ['learning', 'memory'],
      extra: { source_kind: 'book', author: 'Peter C. Brown, Henry L. Roediger III, Mark A. McDaniel', year: '2014', publisher: 'Harvard University Press' },
      body: 'Research-based advice on how learning actually works.\n' },

    // ---- literature ----
    { id: L_FLEETING, title: 'Ahrens: three kinds of notes', type: 'literature', source: S_AHRENS, tags: ['zettelkasten'],
      body: `Ahrens separates notes by what they are for:

- **Fleeting notes** are quick reminders of a thought. They are thrown away once processed.
- **Literature notes** are short, selective summaries of a text, in your own words, with the reference.
- **Permanent notes** are written for your future self: one idea, fully formulated, linked into the slip-box.

My take: the point is not the categories but the *processing step* that turns the first two into the third. See [[${P_REMINDERS}|Fleeting notes are reminders, not knowledge]].
` },
    { id: L_PAPER, title: 'Ahrens: from notes to a paper', type: 'literature', source: S_AHRENS, tags: ['writing', 'zettelkasten'],
      body: `The workflow, as I understand it:

1. Capture fleeting notes.
2. Make literature notes while reading.
3. Write permanent notes, linking each to related ones.
4. File them in the slip-box; add links from an index note.
5. Let topics develop bottom-up instead of brainstorming one.
6. Pick a topic once enough notes have gathered around it.
7. Turn the notes into a rough draft.
8. Edit and proofread.

${img('workflow.png')}

Steps 5 and 6 are the surprising part: see [[${P_BOTTOMUP}|Topics emerge bottom-up from clusters]].
`, attachments: [at('workflow.png')] },
    { id: L_DIGITAL, title: 'Kadavy: a digital slip-box should be non-hierarchical', type: 'literature', source: S_KADAVY, tags: ['zettelkasten', 'tools'],
      body: `Kadavy warns against copying folder habits into a Zettelkasten. Notes should be reachable through many routes (links, tags, search) rather than living in one place.

He also stresses doing small things on a phone: reviewing, tagging and linking a single note in a spare few minutes.

Related: [[${P_INDEXNOTES}|Index notes are entry points, not folders]].
` },
    { id: L_RETRIEVAL, title: 'Make It Stick: testing beats rereading', type: 'literature', source: S_STICK, tags: ['learning', 'memory'],
      body: `The authors summarise many experiments where students who quizzed themselves remembered far more a week later than students who reread the same material, even though rereaders *felt* more confident.

The attached handout lists the study conditions.
`, attachments: [at('retrieval-handout.pdf')] },
    { id: L_INTERLEAVE, title: 'Make It Stick: mixing problem types', type: 'literature', source: S_STICK, tags: ['learning'],
      body: `Practising a mix of problem types (interleaving) feels slower and messier than practising one type at a time (blocking), but leads to better results on later tests, because you learn to tell *which* method a problem needs.
` },

    // ---- permanent ----
    { id: P_CONNECT, title: 'Notes become valuable through their connections', type: 'permanent', tags: ['zettelkasten'],
      body: `A single note is just a thought. Its value grows with every link, because each link is a path by which the idea can resurface in a new context.

This is why linking should be effortless and constant, not an afterthought: see [[${P_LINKTHINK}|Linking forces you to think about relationships]].

Contrast with folders, where a note can only live in one place: [[${P_INDEXNOTES}]].
` },
    { id: P_OWNWORDS, title: 'Writing in your own words is a test of understanding', type: 'permanent', tags: ['writing', 'learning'],
      body: `Copying a sentence feels like learning but asks nothing of you. Rephrasing forces you to decide what the text actually means, and reveals immediately when you don't know.

It is a form of [[${P_ELABORATE}|elaboration]], and it guards against [[${P_FLUENCY}|the illusion of fluency]].
` },
    { id: P_ATOMIC, title: 'One idea per note', type: 'permanent', tags: ['zettelkasten'],
      body: `If a note holds one idea, it can be linked precisely and reused in many arguments. A note with three ideas can only be linked as a bundle.

Rule of thumb: if the title needs "and", split the note.

Links: [[${P_CONNECT}]] · [[${P_NOBLANK}]]
` },
    { id: P_REMINDERS, title: 'Fleeting notes are reminders, not knowledge', type: 'permanent', tags: ['zettelkasten'],
      body: `A fleeting note only has to hold a thought long enough for me to process it, ideally within a day or two. Kept forever, they pile up into an unsearchable mess.

That's what the **Inbox** is for: process each one into a literature or permanent note, or let it go.

Source idea: [[${L_FLEETING}|Ahrens: three kinds of notes]].
` },
    { id: P_BOTTOMUP, title: 'Topics emerge bottom-up from clusters of notes', type: 'permanent', tags: ['writing', 'zettelkasten'],
      body: `Instead of choosing a topic and then researching it, keep writing permanent notes about whatever interests you. Over time, some areas become dense with links: those clusters are your topics.

Choosing a topic this way means you start writing with material already in hand: [[${P_NOBLANK}|Drafting from notes avoids the blank page]].

See also [[${P_CONNECT}]].
` },
    { id: P_LINKTHINK, title: 'Linking forces you to think about relationships', type: 'permanent', tags: ['zettelkasten', 'learning'],
      body: `When I add a link I have to answer: *how* does this relate? Does it support, contradict, extend, or give an example? That question is where a lot of real thinking happens.

It is also a kind of [[${P_ELABORATE}|elaboration]].
` },
    { id: P_RETRIEVAL, title: 'Retrieval practice strengthens memory', type: 'permanent', tags: ['learning', 'memory'],
      body: `Testing yourself on material works better than rereading it. The effort of recalling strengthens the memory and shows what you don't know yet.

It works best combined with the [[${P_SPACING}|spacing effect]], and it is one of the [[${P_DESIRABLE}|desirable difficulties]].

From [[${L_RETRIEVAL}|Make It Stick: testing beats rereading]]. #study
` },
    { id: P_SPACING, title: 'Spacing effect', type: 'permanent', tags: ['learning', 'memory'],
      body: `Spreading practice over time beats cramming it into one session. A bit of forgetting between sessions makes the next recall harder, and that difficulty is what makes it stick.

Pairs with [[${P_RETRIEVAL}]]. Example of [[${P_DESIRABLE}]].
` },
    { id: P_INTERLEAVE, title: 'Interleaving beats blocked practice', type: 'permanent', tags: ['learning'],
      body: `Mixing different kinds of problems feels less productive but teaches you to recognise which approach each problem needs.

From [[${L_INTERLEAVE}]]. Another [[${P_DESIRABLE}|desirable difficulty]].
` },
    { id: P_DESIRABLE, title: 'Desirable difficulties', type: 'permanent', tags: ['learning', 'memory'],
      body: `Some kinds of difficulty during learning improve long-term retention, even though they make learning feel slower:

- [[${P_RETRIEVAL}|Retrieval practice]]
- [[${P_SPACING}|Spacing]]
- [[${P_INTERLEAVE}|Interleaving]]

The trap is that easy methods *feel* better: [[${P_FLUENCY}]].
` },
    { id: P_WRITING, title: 'Writing is the medium of thinking', type: 'permanent', tags: ['writing'],
      body: `Writing isn't only the output of thinking; it is where much of the thinking happens. Ideas that seem clear in my head often fall apart on the page, which is exactly why it's worth writing them down.

Connects to [[${P_OWNWORDS}]] and [[${P_NOBLANK}]].
` },
    { id: P_ELABORATE, title: 'Elaboration connects new knowledge to what you know', type: 'permanent', tags: ['learning'],
      body: `Explaining a new idea in terms of things you already know, or finding examples from your own life, gives the memory more hooks.

In a slip-box, every link you add is a small act of elaboration: [[${P_LINKTHINK}]].
` },
    { id: P_FLUENCY, title: 'Rereading creates an illusion of fluency', type: 'permanent', tags: ['learning', 'memory'],
      body: `Familiar text feels easy to read, and we mistake that ease for knowing it. Self-testing breaks the illusion.

See [[${P_RETRIEVAL}]] and [[${P_OWNWORDS}]].
` },
    { id: P_INDEXNOTES, title: 'Index notes are entry points, not folders', type: 'permanent', tags: ['zettelkasten', 'tools'],
      body: `An index note links to a handful of notes in a meaningful order, like a table of contents for one line of thought. Unlike a folder, it doesn't own those notes: each can appear in many indexes.

Examples in this vault: [[${I_LEARNING}]] and [[${I_METHOD}]].
` },
    { id: P_NOBLANK, title: 'Drafting from notes avoids the blank page', type: 'permanent', tags: ['writing'],
      body: `If the permanent notes already exist, a first draft is mostly arranging and connecting them, not producing text from nothing.

The project note [[${PR_ESSAY}]] is an example of an outline built from notes.
` },

    // ---- index ----
    { id: I_START, title: 'Start here', type: 'index', tags: ['help'], pinned: true,
      body: `Welcome to the sample slip-box. These notes are about learning and the Zettelkasten method itself.

**Try this:**

1. Tap the **+** button and capture a quick thought. It goes to your **Inbox**.
2. Open **Inbox** and process the notes there: make them permanent, keep, archive or delete.
3. Open a note and scroll down to its **Backlinks**: every note that links to it.
4. Edit a note and type \`[[\` to link to another note, or \`#\` to add a tag.
5. Turn your phone sideways in **Review** to see a note and its links side by side, then swipe.
6. Search for the brain region named in the PDF handout attached to a literature note (it starts with h-i-p-p-o). Search reads text inside attachments too.

**Entry points:**

- [[${I_METHOD}|The Zettelkasten method]]
- [[${I_LEARNING}|Learning and memory]]
- [[${PR_ESSAY}|Essay draft: why I keep a slip-box]]
` },
    { id: I_LEARNING, title: 'Learning and memory', type: 'index', tags: ['learning'], pinned: true,
      body: `How learning works, roughly in reading order:

1. [[${P_FLUENCY}]]
2. [[${P_RETRIEVAL}]]
3. [[${P_SPACING}]]
4. [[${P_INTERLEAVE}]]
5. [[${P_DESIRABLE}]]
6. [[${P_ELABORATE}]]
` },
    { id: I_METHOD, title: 'The Zettelkasten method', type: 'index', tags: ['zettelkasten'], pinned: true,
      body: `1. [[${P_REMINDERS}]]
2. [[${P_OWNWORDS}]]
3. [[${P_ATOMIC}]]
4. [[${P_CONNECT}]]
5. [[${P_LINKTHINK}]]
6. [[${P_INDEXNOTES}]]
7. [[${P_BOTTOMUP}]]
8. [[${P_NOBLANK}]]

Sources: [[${S_AHRENS}]], [[${S_KADAVY}]].
` },

    // ---- project ----
    { id: PR_ESSAY, title: 'Essay draft: why I keep a slip-box', type: 'project', tags: ['writing'],
      body: `Outline (each line is a note to turn into a paragraph):

1. Opening: [[${P_WRITING}]]
2. The problem with highlighting and rereading: [[${P_FLUENCY}]]
3. Writing in my own words: [[${P_OWNWORDS}]]
4. Small notes, many links: [[${P_ATOMIC}]], [[${P_CONNECT}]]
5. Letting topics find me: [[${P_BOTTOMUP}]]
6. Closing: [[${P_NOBLANK}]]

Still missing: a note on [[Why handwriting might matter]] (not written yet — tap it to create it).
` },

    // ---- fleeting (inbox) ----
    { id: '202610090812', title: 'Review notes on the train?', type: 'fleeting', status: 'inbox', tags: [],
      body: 'Review notes on the train? 10 minutes each way is enough for a few notes in landscape mode.\n' },
    { id: '202610091745', title: 'Does handwriting help memory?', type: 'fleeting', status: 'inbox', tags: [],
      body: 'Does handwriting help memory more than typing? Heard this on a podcast. Find the study.\n' },
    { id: '202610101230', title: 'Ask Sam how they organise notes', type: 'fleeting', status: 'inbox', tags: [],
      body: 'Ask Sam how they organise reading notes. They mentioned index cards.\n' },
    { id: '202610102105', title: 'en.wikipedia.org/wiki/Zettelkasten', type: 'fleeting', status: 'inbox', tags: [],
      body: 'https://en.wikipedia.org/wiki/Zettelkasten\n\nRead the history section: Luhmann wrote ~90,000 cards.\n' },
    { id: '202610110730', title: 'Photo of whiteboard', type: 'fleeting', status: 'inbox', tags: [],
      body: `Whiteboard sketch from today's study session.\n\n${img('whiteboard.png')}\n`, attachments: [at('whiteboard.png')] },
  ];
}
