export default defineObject({
  name: "PhoneBookShell",
  description: "Layout-only Phone Book application shell.",
  events: { created: {} },

  render() {
    return (
      <main class="min-h-screen bg-slate-950 text-slate-100">
        <div class="mx-auto grid min-h-screen max-w-7xl grid-rows-[auto_1fr_auto] gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <header class="flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-black/20 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-sky-400">Spork Reference App</p>
              <h1 class="mt-1 text-2xl font-semibold tracking-tight text-white">Phone Book</h1>
              <p class="mt-1 text-sm text-slate-400">TypeORM · better-sqlite3 · Tailwind CSS</p>
            </div>
            <Slot name="search" class="w-full sm:max-w-md" />
          </header>

          <section class="grid min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <section class="min-h-[32rem] rounded-3xl border border-white/10 bg-slate-900/55 p-3 shadow-xl shadow-black/10 sm:p-5">
              <Slot name="list" />
            </section>
            <aside class="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/10">
              <Slot name="form" />
            </aside>
          </section>

          <footer class="rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
            <Slot name="status" />
          </footer>
        </div>
      </main>
    );
  },
});
