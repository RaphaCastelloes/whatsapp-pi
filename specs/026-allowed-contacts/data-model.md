# Data Model: Allowed Contacts Rename

## Entity: Allow List Entry
- **Purpose**: Represents a contact currently permitted in the WhatsApp allow-list flow.
- **Fields**:
  - `number`: Contact identifier shown to the user.
  - `name`: Optional display alias shown alongside the number.
- **Rules**:
  - Existing entries remain valid.
  - No new persistence fields are required.
  - Terminology change must not alter membership or ordering.

## Relationship
- Reuses the existing contact data already shown in `/whatsapp` menus.
- No new entities or migrations introduced.
