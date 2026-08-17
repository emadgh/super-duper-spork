# Super Duper Spork Studio

A TypeScript + Deno application-builder prototype based on independent objects connected through **Event → Action** rules.

The editor owns the project workspace. Users work with projects, object folders, object code, connections, Blackboard values, preview, and diagnostics from inside the studio instead of manually managing project files.

## Current feature set

- Project Manager with recent-project switching and project-folder reveal.
- Project-owned workspace under `workspace/projects/`.
- Independent TypeScript object files; an object exposes only its own state, events, actions, typed inputs, and typed outputs.
- Object folders with nested organization, create-in-folder, move-to-folder, and reveal-object-in-file-manager.
- Built-in TypeScript code editor with line numbers, syntax highlighting, indentation helpers, cursor position, Ctrl+S, and validation feedback.
- Live object introspection: after saving object code, exposed events/actions/ports immediately become available to the visual editor.
- Event → Action rules with multiple sequential actions.
- Typed action input/output ports (`number`, `string`, `boolean`, `any`).
- Input bindings from literals, Blackboard values, object state, event outputs, and previous action outputs.
- Action outputs can feed later actions and/or write to Blackboard.
- Project Blackboard with typed defaults and live runtime values.
- **Connection Diagram** view that renders Events, Actions, data bindings, flow links, and Blackboard writes as nodes and edges.
- Resizable navigator, code, logic, and preview panels with persisted layout.
- Runtime Preview and execution trace.

## Built-in example projects

### Counter Demo

The minimal architecture example:

```text
button1.click
    ↓
counter1.increment
    ↓
Blackboard.count
```

### Calculator

A small typed-port example demonstrating event outputs → action inputs → action outputs → another action + Blackboard.

### Calculator · Real Demo

A functional calculator intentionally split into independent objects and folders:

```text
objects/
├─ UI/
│  └─ CalculatorShell.ts
└─ Logic/
   └─ CalculatorEngine.ts
```

`CalculatorShell` owns the calculator surface and emits only `keyPressed { key }`. `CalculatorEngine` owns calculation state and exposes `pressKey`. The project rule connects them:

```text
calculatorUI.keyPressed
    ↓ key
calculatorEngine.pressKey
    ├─ display ───────→ Blackboard.display
    ├─ expression ────→ Blackboard.expression
    ├─ memoryValue ───→ Blackboard.memory
    └─ outputs ───────→ calculatorUI.setView
```

The demo includes digits, decimal input, add/subtract/multiply/divide, equals, `C`, `CE`, backspace, `MC`, `MR`, `M+`, and `M-`.

## Object contract

Each object is self-contained and exports a definition:

```ts
export default defineObject({
  name: "Example",

  state: {},

  events: {
    submit: {
      outputs: {
        value: { type: "number" },
      },
    },
  },

  actions: {
    setValue: {
      inputs: {
        value: { type: "number", default: 0 },
      },
      outputs: {
        currentValue: { type: "number" },
      },
      run(context, inputs) {
        context.state.value = inputs.value;
        return { currentValue: context.state.value };
      },
    },
  },

  mount({ host, state, emit }) {
    // Optional runtime UI owned only by this object.
  },
});
```

Objects do not import or know about other project objects. Cross-object behavior belongs to project Event → Action rules.

## Run from source

Requires Deno 2.x.

```bash
deno task dev
```

Open `http://localhost:8000`.

On Windows, `run-dev.bat` starts the development server.

The Reveal commands launch the operating-system file manager, therefore `dev`/`start` include Deno's `--allow-run` permission.

## Validate

```bash
deno task check
deno task test
```

## Build

```bash
deno task build
deno task start
```

`build` creates `dist/`. `start` serves the pre-transpiled client while keeping the Deno project/object API active.

## Current boundary

This is still an early application-builder foundation. Conditions, object/instance property overrides, object rename/delete, undo/redo across project operations, a full TypeScript language service, editable node-graph wiring, and sandboxing of untrusted object code remain future work.


## Modular building blocks

Projects can compose visual objects instead of growing one large UI object. A parent mount may return named `slots`; child instances select a parent instance and slot, and reusable component files receive per-instance `props`. The modular calculator demonstrates this with one reusable key component instantiated for every key and separate command files for arithmetic, editing, and memory behavior.

The Objects panel also includes an **Action Library** (⚡) for inserting ready-made typed actions such as Add, Divide, Clamp, Round, Concat, Equals, and Set Value.
