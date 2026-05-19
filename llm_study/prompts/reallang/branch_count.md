# Task: branch_count (RealLang)

Write a complete **RealLang** program that:

1. Loops `i` from `0` to `9_999_999` (ten million iterations, exclusive upper bound `10000000`).
2. Increments a counter when `i` is even. Use `(i / 2) * 2 == i` for evenness (RealLang has no `%` yet).
3. `if` must include an `else` branch (use `set count = count + 0` in the else if needed).
4. Prints the final count with `print_i32` and returns `0`.

**Expected stdout line:** `5000000`

Output only the RealLang source file contents.
