const mods = [
  '../js/util.js',
  '../js/schedule.js',
  '../js/importers.js',
  '../js/ui.js',
  '../js/seed.js',
  '../js/zf-html.js',
  '../js/views/timetable.js',
  '../js/views/detail.js',
  '../js/views/editor.js',
  '../js/views/agenda.js',
  '../js/views/tools.js',
  '../js/views/me.js',
  '../js/views/import.js',
  '../js/store.js',
];

for (const m of mods) {
  try {
    await import(m);
    console.log('OK  ', m);
  } catch (err) {
    console.log('FAIL', m, '=>', err.message);
  }
}
