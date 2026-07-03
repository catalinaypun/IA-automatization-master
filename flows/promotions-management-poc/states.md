# States — Pricing Desk

| State            | Trigger                                    | Expected behavior                                               | Deep link                 |
|------------------|--------------------------------------------|-----------------------------------------------------------------|---------------------------|
| default          | Page load with valid context               | Promotions accordion is visible, first item expanded; Add Promotion opens builder view | `?state=default`          |
| loading          | Promotion data is being fetched            | Loading indicator appears and promotions accordion is hidden    | `?state=loading`          |
| validation-error | User submits required fields incomplete    | Validation message appears while the accordion remains visible  | `?state=validation-error` |
| system-error     | Promotion retrieval fails                  | System error message appears and promotions accordion is hidden | `?state=system-error`     |
