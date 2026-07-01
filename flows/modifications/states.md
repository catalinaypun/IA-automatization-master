# States — Modifications (Job Detail)

| State            | Trigger                           | Expected behavior                                             | Deep link              |
|------------------|-----------------------------------|---------------------------------------------------------------|------------------------|
| default          | Page load, job data available     | Split layout with all fields populated and edit panel active  | `?state=default`       |
| loading          | Data fetch in progress            | Skeleton placeholders in both panels                          | `?state=loading`       |
| validation-error | User submits invalid field        | Inline error message below the offending field                | `?state=validation-error` |
| permission-denied| User lacks edit rights            | Edit panel fields are disabled; read-only label shown         | `?state=permission-denied` |
