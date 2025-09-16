# DevHub+ Socket.io Real-time Events Documentation

## Overview
DevHub+ uses Socket.io for real-time communication including chat messages, code collaboration, typing indicators, and presence updates.

## Connection
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});
```

---

## Core Events

### 1. Join Session
**Client → Server**: `joinSession`

Join a live coding/chat session room.

```javascript
socket.emit('joinSession', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe'
});
```

**Server → Client**: `sessionJoined`
```javascript
socket.on('sessionJoined', (data) => {
  console.log('Joined session:', data.session);
  console.log('Message:', data.message);
});
```

**Server → Other Users**: `userJoined`
```javascript
socket.on('userJoined', (data) => {
  console.log(`${data.username} joined the session`);
  // data: { userId, username, message, timestamp }
});
```

### 2. Leave Session
**Client → Server**: `leaveSession`

```javascript
socket.emit('leaveSession', {
  sessionId: 1
});
```

**Server → Other Users**: `userLeft`
```javascript
socket.on('userLeft', (data) => {
  console.log(`${data.username} left the session`);
  // data: { userId, username, message, timestamp }
});
```

---

## Chat Messages

### Send Message
**Client → Server**: `sendMessage`

Send a chat message (automatically saved to database).

```javascript
socket.emit('sendMessage', {
  content: 'Hello everyone! How are you doing?',
  sessionId: 1,
  userId: 123
});
```

### Receive Messages
**Server → All Users**: `messageReceived`

```javascript
socket.on('messageReceived', (message) => {
  console.log('New message:', message);
  // message: {
  //   id: 1,
  //   content: 'Hello everyone!',
  //   createdAt: '2025-09-13T10:30:00.000Z',
  //   user: { id: 123, username: 'johndoe', reputation: 50 },
  //   sessionId: 1
  // }
});
```

---

## Code Collaboration

### Update Code
**Client → Server**: `updateCode`

Share real-time code changes with other session participants.

```javascript
socket.emit('updateCode', {
  code: 'const greeting = "Hello World!";',
  language: 'javascript',
  title: 'Greeting Example',
  sessionId: 1,
  userId: 123
});
```

### Receive Code Updates
**Server → Other Users**: `codeUpdated`

```javascript
socket.on('codeUpdated', (data) => {
  console.log('Code updated by:', data.username);
  updateCodeEditor(data.code);
  // data: {
  //   code: 'const greeting = "Hello World!";',
  //   language: 'javascript',
  //   title: 'Greeting Example',
  //   userId: 123,
  //   username: 'johndoe',
  //   sessionId: 1,
  //   timestamp: '2025-09-13T10:30:00.000Z'
  // }
});
```

---

## Typing Indicators

### Send Typing Status
**Client → Server**: `typing`

```javascript
// User started typing
socket.emit('typing', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe',
  isTyping: true
});

// User stopped typing
socket.emit('typing', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe',
  isTyping: false
});
```

### Receive Typing Updates
**Server → Other Users**: `userTyping`

```javascript
socket.on('userTyping', (data) => {
  if (data.isTyping) {
    showTypingIndicator(data.username);
  } else {
    hideTypingIndicator(data.username);
  }
  // data: { userId, username, isTyping, timestamp }
});
```

---

## Screen Sharing

### Share Screen
**Client → Server**: `shareScreen`

```javascript
// Start screen sharing
socket.emit('shareScreen', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe',
  isSharing: true
});

// Stop screen sharing
socket.emit('shareScreen', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe',
  isSharing: false
});
```

### Receive Screen Share Updates
**Server → Other Users**: `screenShared`

```javascript
socket.on('screenShared', (data) => {
  if (data.isSharing) {
    console.log(`${data.username} started screen sharing`);
  } else {
    console.log(`${data.username} stopped screen sharing`);
  }
  // data: { userId, username, isSharing, timestamp }
});
```

---

## Voice Chat

### Voice Activity
**Client → Server**: `voiceChat`

```javascript
// User started speaking
socket.emit('voiceChat', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe',
  isSpeaking: true
});

// User stopped speaking
socket.emit('voiceChat', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe',
  isSpeaking: false
});
```

### Receive Voice Activity
**Server → Other Users**: `voiceActivity`

```javascript
socket.on('voiceActivity', (data) => {
  if (data.isSpeaking) {
    highlightSpeakingUser(data.username);
  } else {
    removeSpeakingHighlight(data.username);
  }
  // data: { userId, username, isSpeaking, timestamp }
});
```

---

## User Presence

### Update Presence
**Client → Server**: `updatePresence`

```javascript
socket.emit('updatePresence', {
  sessionId: 1,
  userId: 123,
  username: 'johndoe',
  status: 'online' // 'online', 'away', 'busy'
});
```

### Receive Presence Updates
**Server → Other Users**: `presenceUpdated`

```javascript
socket.on('presenceUpdated', (data) => {
  updateUserStatus(data.userId, data.status);
  // data: { userId, username, status, timestamp }
});
```

---

## Error Handling

### Receive Errors
**Server → Client**: `error`

```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
  showErrorNotification(error.message);
});
```

---

## Connection Events

### Connection Established
```javascript
socket.on('connect', () => {
  console.log('Connected to server');
  console.log('Socket ID:', socket.id);
});
```

### Disconnection
```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected from server:', reason);
  showConnectionLostMessage();
});
```

### Reconnection
```javascript
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  hideConnectionLostMessage();
});
```

---

## Complete Frontend Integration Example

```javascript
import io from 'socket.io-client';

class DevHubSocket {
  constructor(userId, username) {
    this.socket = io('http://localhost:3000');
    this.userId = userId;
    this.username = username;
    this.currentSessionId = null;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to DevHub+ server');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });

    // Session events
    this.socket.on('sessionJoined', (data) => {
      console.log('Joined session:', data.session.title);
    });

    this.socket.on('userJoined', (data) => {
      this.addUserToSession(data);
    });

    this.socket.on('userLeft', (data) => {
      this.removeUserFromSession(data);
    });

    // Chat events
    this.socket.on('messageReceived', (message) => {
      this.displayMessage(message);
    });

    // Code collaboration events
    this.socket.on('codeUpdated', (data) => {
      this.updateSharedCode(data);
    });

    // Typing indicators
    this.socket.on('userTyping', (data) => {
      this.showTypingIndicator(data);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('Socket error:', error.message);
    });
  }

  // Join a session
  joinSession(sessionId) {
    this.currentSessionId = sessionId;
    this.socket.emit('joinSession', {
      sessionId,
      userId: this.userId,
      username: this.username
    });
  }

  // Send chat message
  sendMessage(content) {
    if (!this.currentSessionId) return;
    
    this.socket.emit('sendMessage', {
      content,
      sessionId: this.currentSessionId,
      userId: this.userId
    });
  }

  // Update shared code
  updateCode(code, language, title) {
    if (!this.currentSessionId) return;
    
    this.socket.emit('updateCode', {
      code,
      language,
      title,
      sessionId: this.currentSessionId,
      userId: this.userId
    });
  }

  // Send typing indicator
  setTyping(isTyping) {
    if (!this.currentSessionId) return;
    
    this.socket.emit('typing', {
      sessionId: this.currentSessionId,
      userId: this.userId,
      username: this.username,
      isTyping
    });
  }

  // Leave current session
  leaveSession() {
    if (!this.currentSessionId) return;
    
    this.socket.emit('leaveSession', {
      sessionId: this.currentSessionId
    });
    this.currentSessionId = null;
  }

  // Helper methods (implement based on your UI)
  addUserToSession(data) {
    // Add user to participants list
  }

  removeUserFromSession(data) {
    // Remove user from participants list
  }

  displayMessage(message) {
    // Add message to chat UI
  }

  updateSharedCode(data) {
    // Update code editor with new code
  }

  showTypingIndicator(data) {
    // Show/hide typing indicator in UI
  }
}

// Usage
const socket = new DevHubSocket(userId, username);
socket.joinSession(sessionId);
```

---

## Room Structure

Sessions are organized into rooms using the pattern:
- Room name: `session_{sessionId}`
- Example: `session_1`, `session_2`, etc.

This ensures users only receive events for sessions they've joined.

---

## Event Flow Examples

### Joining a Session
1. Client emits `joinSession` with session details
2. Server validates session and user
3. Server adds user to session room
4. Server emits `sessionJoined` to the user
5. Server broadcasts `userJoined` to other session participants

### Sending a Message
1. Client emits `sendMessage` with message content
2. Server validates session and saves message to database
3. Server broadcasts `messageReceived` to all session participants (including sender)

### Real-time Code Collaboration
1. User types in code editor
2. Client emits `updateCode` with code changes
3. Server broadcasts `codeUpdated` to other session participants
4. Other users' code editors update in real-time

This Socket.io implementation provides a robust foundation for real-time collaboration in DevHub+! 🚀