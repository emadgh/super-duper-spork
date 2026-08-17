# Changelog

## 0.4.0 - Modular components and ready actions

- Added parent/child UI composition with named slots.
- Added per-instance props so one reusable component file can back many configured component instances.
- Rebuilt the calculator example as a modular project template instead of a two-file UI/engine God Component pair.
- Every calculator key is an independent component instance of `UI/CalculatorKey.ts`.
- Add, Subtract, Multiply, and Divide are independent command files; input, clear, backspace, and memory commands are split as well.
- Added an Action Library with ready Math, Number, Text, Logic, and State actions.
- Ready actions can be inserted from the Objects panel with the lightning button.
- CI now validates all feature branches and publishes build/source artifacts.


## 0.3.0 - Diagram, object folders, reveal, real calculator

- Added a read-only Connection Diagram for visualizing Event → Action flow as nodes.
- Diagram also shows typed data links between event/action ports and action-output writes to Blackboard.
- Added nested object folders to the project model and object browser.
- New objects can be created inside the selected folder and existing objects can be moved between folders.
- Added Reveal Project Folder and Reveal Object commands using the operating-system file manager.
- Project Manager now exposes Reveal and Open actions separately.
- Added **Calculator · Real Demo**, organized into `UI/` and `Logic/` object folders.
- Real calculator supports digits, decimal, +, −, ×, ÷, equals, C, CE, backspace, MC, MR, M+, and M-.
- Calculator UI and calculation engine remain independent; communication happens only through project Event/Action wiring and typed ports.
- Project manifest format upgraded to v3 with automatic v2 loading/migration.
- Deno dev/start permissions now include `--allow-run` for Reveal commands.

## 0.2.1 - Startup fix

- Fixed startup crash caused by demo object source constants being accessed before initialization.
- Bootstrap now runs only after the module has finished initializing all project templates.
- Re-ran client TypeScript validation.

## Studio MVP 0.2

- Reworked the UI into a compact IDE-style studio.
- Added Project Manager and fast switching between projects.
- Added resizable Objects/Blackboard, editor, logic, and preview panels.
- Added a TypeScript code editor with line numbers, syntax highlighting, indentation, cursor position, Ctrl+S, and save diagnostics.
- Added object API introspection for exposed events, actions, inputs, and outputs.
- Added typed action input/output ports and sequential action chaining.
- Added value bindings from literal values, Blackboard variables, object state, event payload outputs, and previous action outputs.
- Added project Blackboard with default values and live runtime values.
- Added runtime execution trace.
- Added Counter Demo and Calculator example projects.
