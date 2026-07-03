# States — Pricing Desk

| State            | Trigger                                    | Expected behavior                                               | Deep link                 |
|------------------|--------------------------------------------|-----------------------------------------------------------------|---------------------------|
| default          | Page load with valid context               | Two-panel promotions layout is visible, first promotion is selected by default, and Add Promotion opens builder view | `?state=default`          |
| loading          | Promotion data is being fetched            | Loading indicator appears and two-panel promotions layout is hidden | `?state=loading`          |
| validation-error | User submits required fields incomplete    | Validation message appears while the two-panel promotions layout remains visible | `?state=validation-error` |
| system-error     | Promotion retrieval fails                  | System error message appears and two-panel promotions layout is hidden | `?state=system-error`     |
