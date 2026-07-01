# States — State Switcher Demo

| State   | Trigger                              | Expected behavior                                                        | Deep link           |
|---------|--------------------------------------|--------------------------------------------------------------------------|---------------------|
| default | Page load with no `?state=` param    | Work order list shown with 3 items and status badges. Toolbar active on Default. | `?state=default`    |
| error   | `?state=error` in URL                | Reschedule form visible; date field has red border and error message; submit button disabled. | `?state=error`      |
| empty   | `?state=empty` in URL                | Empty-state card shown with explanatory copy and a Refresh button. Work order list hidden. | `?state=empty`      |
