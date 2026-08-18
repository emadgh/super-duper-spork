# Expression Engine

Expression bindings compute an input value without executing JavaScript. They are parsed by the Studio expression engine and work in both Condition and Action inputs.

## References

```text
@event.value
@board.Step
@state.counter1.value
@output.calculate.result
```

- `@event` reads the current event payload.
- `@board` reads a project Blackboard value.
- `@state` reads runtime state from an object instance.
- `@output` reads the result of an earlier Action step in the same rule.

## Supported syntax

Literals:

```text
12
3.5
"hello"
'text'
true
false
null
```

Operators, from general arithmetic/comparison/logical groups:

```text
!  +  -
*  /  %
+  -
<  <=  >  >=
===  !==
&&
||
??
```

Parentheses can be used to make precedence explicit.

Examples:

```text
@event.value + @board.Step * 2
(@state.counter1.value + 10) >= @board.Minimum
@event.label ?? "Untitled"
@event.enabled && @state.form.isValid
"Total: " + @output.calculate.result
```

## Safety model

Expressions are not JavaScript. The engine does not use `eval`, `Function`, dynamic imports, function calls, assignment, array indexing, constructors, or arbitrary global/property access.

Expression source length, token count, parser complexity, and evaluation depth are bounded. Invalid expressions are reported through runtime error tracing instead of being executed as code.

## Rule semantics

Condition expressions run before Actions because Conditions are evaluated first. Therefore `@output` is normally useful in Action inputs, where it can reference an earlier Action step. An output does not exist before its Action has executed.

The same expression implementation is shipped with Studio preview and standalone builds so rule behavior is consistent after export.
