# States - Upsells

| State             | Trigger                                                                 | Expected behavior                                                                                  | Deep link                   |
|--------------------|--------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|-------------------------------|
| default            | Opportunity record loads, Capture tab selected                          | Opportunity product table shows all lines with Order Detail Type (Expansion / Initial Sale / Upsell); Vehicles/Asset Trackers/Key Fob IDs sections empty; "Capture customer details" enabled | `?state=default`            |
| capture-data       | User clicks "Capture customer details"                                  | Modal step 1 shows Existing/New table per line plus a valid, pre-filled shipping address and contact | `?state=capture-data`       |
| validation-error   | User reaches step 1 without an address/contact on file                  | Same modal, address and contact selects show red border and inline "Please select a ... to continue." messages | `?state=validation-error`   |
| select-vehicles    | User selects an Upsell-type line (existing core, new feature only)      | Modal shows a checkbox list of vehicles already in the system for that account — no new VIN can be entered | `?state=select-vehicles`    |
| enter-vehicles     | User selects an Expansion or Initial Sale line (full bundle, new core)  | Modal shows an editable table to type in new vehicle VINs                                          | `?state=enter-vehicles`     |
| incompatible       | Hardware Specifier compatibility check fails for the selected vehicle   | Modal shows the incompatible-hardware result, current vs required core, and the replacement/shipping note | `?state=incompatible`       |
| empty              | "Capture customer details" is not yet enabled for this Opportunity      | Warning banner "The 'Capture customer details' functionality is not yet available."; action disabled | `?state=empty`              |
