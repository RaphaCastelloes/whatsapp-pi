# Quickstart Guide: QR Code Display for WhatsApp Connection

**Feature**: 014-qr-code-display  
**Date**: 2025-04-15  
**Purpose**: Quick setup and usage guide for QR code functionality

## Overview

This feature enables WhatsApp connection via QR code scanning when using the `--whatsapp-pi-online` flag without saved credentials. The system displays a QR code in your terminal that you can scan with your WhatsApp mobile app to establish the connection.

## Prerequisites

- Node.js 20+ and TypeScript 5.x
- WhatsApp mobile app installed on your smartphone
- Terminal that supports UTF-8 characters (most modern terminals)
- Stable internet connection
- Existing whatsapp-pi installation

## Installation

### 1. Update Dependencies

```bash
cd whatsapp-pi
npm install qrcode-terminal
```

### 2. Verify Installation

```bash
npm test
```

All tests should pass, including the new QR code functionality tests.

## Usage

### First-Time Connection

1. **Run with Online Flag**
   ```bash
   pi -e whatsapp-pi.ts --whatsapp-pi-online
   ```

2. **QR Code Display**
   - Terminal will display a QR code
   - Instructions for scanning will appear below the QR code
   - QR code refreshes automatically every 60 seconds

3. **Scan QR Code**
   - Open WhatsApp on your mobile device
   - Go to **Settings > Linked Devices**
   - Tap **Link a device**
   - Scan the QR code displayed in your terminal

4. **Connection Established**
   - Terminal will show "Connected" status
   - Credentials are automatically saved for future use

### Re-pairing After Logout

1. **Logout (if needed)**
   ```bash
   /whatsapp-logout
   ```

2. **Reconnect**
   ```bash
   pi -e whatsapp-pi.ts --whatsapp-pi-online
   ```
   - New QR code will be displayed for re-pairing

## User Interface

### QR Code Display

```
█████████████████████████████████████
█████████████████████████████████████
█████████████████████████████████████
█████████████████████████████████████
█████████████████████████████████████
█████████████████████████████████████

WhatsApp: Pairing...
Scan this QR code with your WhatsApp mobile app:

1. Open WhatsApp on your phone
2. Go to Settings > Linked Devices
3. Tap "Link a device"
4. Point your camera at this QR code

QR code expires in 45 seconds
```

### Status Messages

- **WhatsApp: Pairing...** - QR code displayed, waiting for scan
- **WhatsApp: Connected** - Successfully paired and connected
- **WhatsApp: QR expired, generating new code...** - QR refresh in progress
- **WhatsApp: Connection failed, please retry** - Error occurred

## Configuration

### Default Settings

- QR refresh interval: 60 seconds
- Expiration warning: 15 seconds before expiry
- Max refresh attempts: Unlimited
- Terminal width: Auto-detected

### Custom Configuration (Optional)

Configuration is handled automatically, but you can modify behavior through environment variables:

```bash
# QR refresh interval in milliseconds
export QR_REFRESH_INTERVAL=60000

# Show expiration warning
export QR_SHOW_WARNING=true

# Warning time in seconds
export QR_WARNING_TIME=15
```

## Troubleshooting

### Common Issues

#### QR Code Not Displaying

**Problem**: Terminal shows error or no QR code appears

**Solutions**:
1. Check terminal supports UTF-8:
   ```bash
   echo $TERM
   ```
2. Try a different terminal (Windows Terminal, iTerm2, etc.)
3. Ensure `qrcode-terminal` package is installed

#### QR Code Won't Scan

**Problem**: Mobile app can't scan the QR code

**Solutions**:
1. Ensure good lighting and steady camera
2. Make sure entire QR code is visible in terminal
3. Try zooming out or making terminal larger
4. Check for terminal character encoding issues

#### Connection Times Out

**Problem**: QR code expires before scanning

**Solutions**:
1. New QR code generates automatically
2. Scan quickly after QR appears
3. Check internet connection stability
4. Restart the process if needed

#### Terminal Errors

**Problem**: Error messages about terminal capabilities

**Solutions**:
1. Update terminal to latest version
2. Try different terminal application
3. Check character encoding settings:
   ```bash
   export LANG=en_US.UTF-8
   ```

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Terminal does not support UTF-8` | Old terminal or wrong settings | Use modern terminal or set UTF-8 encoding |
| `QR generation failed` | Network issues or Baileys error | Check internet, restart application |
| `Connection timeout` | QR not scanned in time | Try again with new QR code |
| `Invalid credentials` | Corrupted auth state | Run `/whatsapp-logout` and retry |

## Development

### Running Tests

```bash
# Unit tests
npm test

# Integration tests (requires WhatsApp)
npm run test:integration
```

### Debug Mode

Enable verbose output for debugging:

```bash
pi -e whatsapp-pi.ts --whatsapp-pi-online --verbose
```

### Test QR Flow

For testing without actual WhatsApp scanning:

```bash
# Test QR generation
npm run test:qr-display

# Test terminal rendering
npm run test:qr-render
```

## Security Notes

- QR codes are temporary and expire after 60 seconds
- Credentials are stored locally in `~/.pi/whatsapp-pi/auth/`
- No QR data is transmitted to external servers
- Connection uses WhatsApp's end-to-end encryption

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Enable verbose mode for detailed logs
3. Review the test results for any failures
4. Check network connectivity and terminal compatibility

## Next Steps

After successful QR pairing:

- WhatsApp connection is established automatically
- Credentials are saved for future connections
- Use `/whatsapp-status` to check connection status
- Use `/whatsapp-logout` to clear credentials if needed

## Related Commands

- `/whatsapp-connect` - Manual connection (with saved credentials)
- `/whatsapp-logout` - Clear saved credentials
- `/whatsapp-status` - Check connection status
- `/permission-mode` - Configure message permissions
