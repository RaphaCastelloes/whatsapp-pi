# Menu Contract: WhatsApp TUI

## Command
- `/whatsapp`: Opens the WhatsApp management menu.

## Menu Items
1. **Login**: 
   - State: Only visible if `status == 'logged-out'`.
   - Action: Start pairing, display QR code.
2. **Connect**:
   - State: Visible if `status == 'disconnected'`.
   - Action: Set status to `connected`.
3. **Disconnect**:
   - State: Visible if `status == 'connected'`.
   - Action: Set status to `disconnected`.
4. **Logoff**:
   - State: Visible if `status != 'logged-out'`.
   - Action: Delete credentials, set status to `logged-out`.
5. **Allow Numbers**:
   - State: Always visible.
   - Action: Open sub-menu to view/add/remove numbers.
