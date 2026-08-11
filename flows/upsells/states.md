# States - Upsells

| State            | Trigger                                            | Expected behavior                                                        | Deep link                 |
|------------------|------------------------------------------------------|-----------------------------------------------------------------------------|----------------------------|
| default          | Order loads with eligible upsells available            | Configure Upsell form visible; existing upsells listed in related list      | `?state=default`          |
| loading          | Eligible upsell products are being fetched              | Spinner shown over the Configure Upsell card body                          | `?state=loading`          |
| empty            | No eligible upsells for this Order/account              | Empty-state illustration + message shown; form hidden; related list shows "No upsells added yet." | `?state=empty`            |
| validation-error | User attempts to add an upsell with quantity = 0        | Error banner shown at top of card; Quantity field shows inline help text    | `?state=validation-error` |
