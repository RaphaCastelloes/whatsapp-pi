# Specification - Image Recognition Support

## Problem Statement
Users want to be able to send images to the Pi Agent via WhatsApp and have the Agent analyze/describe them. Currently, images are only logged as "[Image]" without content being forwarded to the LLM.

## Goals
- Support downloading `imageMessage` from WhatsApp.
- Forward downloaded images to Pi as base64 attachments.
- Support image captions.

## User Stories
- **US1**: As a user, I want to send a photo to the Agent so it can help me with what's in the image.
- **US2**: As a user, I want the Agent to receive the text caption I send along with the image.

## Success Criteria
- [ ] Images sent to WhatsApp are forwarded to Pi.
- [ ] The Agent can describe the contents of the image.
- [ ] Captions are included in the message sent to Pi.
