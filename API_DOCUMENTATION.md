# DevHub+ API Documentation

## Base URL
```
http://localhost:3000
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Response Format
All responses are in JSON format with consistent structure:
```json
{
  "message": "Success message",
  "data": { ... },
  "error": "Error message (if applicable)"
}
```

---

## Authentication Endpoints

### Register User
**POST** `/auth/register`

Register a new user account.

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "message": "User created successfully",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "reputation": 0,
    "createdAt": "2025-09-13T08:40:29.728Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login User
**POST** `/auth/login`

Authenticate user and get JWT token.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "reputation": 0,
    "bio": null,
    "createdAt": "2025-09-13T08:40:29.728Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Current User
**GET** `/auth/me` 🔒

Get current authenticated user profile.

```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <your-token>"
```

### Logout
**POST** `/auth/logout` 🔒

Logout current user (client-side token removal).

---

## User Endpoints

### Get User Profile
**GET** `/api/users/:id`

Get detailed user profile by ID including reputation, bio, and activity counts.

```bash
curl -X GET http://localhost:3000/api/users/1
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    "reputation": 0,
    "bio": null,
    "createdAt": "2025-09-13T08:40:29.728Z",
    "counts": {
      "questions": 1,
      "answers": 1,
      "snippets": 1,
      "resumes": 1,
      "skills": 1,
      "sessions": 1
    }
  }
}
```

### Update Profile
**PUT** `/api/users/profile` 🔒

Update current user profile.

```bash
curl -X PUT http://localhost:3000/api/users/profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "username": "newusername",
    "bio": "Full-stack developer passionate about React and Node.js"
  }'
```

---

## Question Endpoints

### Get Questions
**GET** `/api/questions`

Get all questions with pagination and filtering.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10)
- `tags` (filter by tags)

```bash
curl -X GET "http://localhost:3000/api/questions?page=1&limit=5&tags=react"
```

**Response:**
```json
{
  "questions": [
    {
      "id": 1,
      "title": "How to use React hooks?",
      "body": "I need help understanding React hooks, especially useState and useEffect.",
      "tags": ["react", "javascript", "hooks"],
      "createdAt": "2025-09-13T08:41:11.608Z",
      "userId": 1,
      "user": {
        "id": 1,
        "username": "testuser",
        "reputation": 0
      },
      "_count": {
        "answers": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "pages": 1
  }
}
```

### Get Question by ID
**GET** `/api/questions/:id`

Get specific question with answers.

```bash
curl -X GET http://localhost:3000/api/questions/1
```

### Create Question
**POST** `/api/questions` 🔒

Create a new question.

```bash
curl -X POST http://localhost:3000/api/questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "title": "How to use React hooks?",
    "body": "I need help understanding React hooks, especially useState and useEffect.",
    "tags": ["react", "javascript", "hooks"]
  }'
```

---

## Answer Endpoints

### Create Answer
**POST** `/api/answers` 🔒

Create an answer for a question.

```bash
curl -X POST http://localhost:3000/api/answers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "body": "React hooks are functions that let you use state and other React features in functional components.",
    "questionId": 1
  }'
```

### Get Answers by Question
**GET** `/api/answers/question/:questionId`

Get all answers for a specific question.

```bash
curl -X GET http://localhost:3000/api/answers/question/1
```

**Response:**
```json
{
  "answers": [
    {
      "id": 1,
      "body": "React hooks are functions that let you use state and other React features in functional components.",
      "createdAt": "2025-09-13T08:45:32.472Z",
      "userId": 1,
      "questionId": 1,
      "user": {
        "id": 1,
        "username": "testuser",
        "reputation": 0
      }
    }
  ]
}
```

### Get User Answers
**GET** `/api/answers/user/:userId`

Get answers by specific user.

```bash
curl -X GET http://localhost:3000/api/answers/user/1
```

---

## Code Snippet Endpoints

### Get Snippets
**GET** `/api/snippets`

Get all code snippets with pagination.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10)
- `language` (filter by programming language)

```bash
curl -X GET "http://localhost:3000/api/snippets?language=javascript"
```

### Create Snippet
**POST** `/api/snippets` 🔒

Create a new code snippet.

```bash
curl -X POST http://localhost:3000/api/snippets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "title": "React useState Example",
    "code": "const [count, setCount] = useState(0);",
    "language": "javascript"
  }'
```

### Get Snippet by ID
**GET** `/api/snippets/:id`

Get specific code snippet.

```bash
curl -X GET http://localhost:3000/api/snippets/1
```

---

## Resume Endpoints

### Upload Resume
**POST** `/api/resumes` 🔒

Upload a resume for review.

```bash
curl -X POST http://localhost:3000/api/resumes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "fileUrl": "https://example.com/resume.pdf"
  }'
```

### Get User Resumes
**GET** `/api/resumes/user/:userId`

Get resumes by user ID.

```bash
curl -X GET http://localhost:3000/api/resumes/user/1
```

### Add Resume Review
**PUT** `/api/resumes/:id/review` 🔒

Add review to a resume.

```bash
curl -X PUT http://localhost:3000/api/resumes/1/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "review": "Great resume! Consider adding more technical skills section."
  }'
```

---

## Skill Rating Endpoints

### Add/Update Skill
**POST** `/api/skills` 🔒

Add or update a skill rating.

```bash
curl -X POST http://localhost:3000/api/skills \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "skillName": "React",
    "rating": 8
  }'
```

### Get User Skills
**GET** `/api/skills/user/:userId`

Get skills by user ID.

```bash
curl -X GET http://localhost:3000/api/skills/user/1
```

### Delete Skill
**DELETE** `/api/skills/:id` 🔒

Delete a skill rating.

```bash
curl -X DELETE http://localhost:3000/api/skills/1 \
  -H "Authorization: Bearer <your-token>"
```

---

## Session Endpoints

### Create Session
**POST** `/api/sessions` 🔒

Create a new chat session.

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "title": "React Development Discussion"
  }'
```

### Get Sessions
**GET** `/api/sessions`

Get all active sessions.

```bash
curl -X GET http://localhost:3000/api/sessions
```

### Get Session by ID
**GET** `/api/sessions/:id`

Get session with messages.

```bash
curl -X GET http://localhost:3000/api/sessions/1
```

---

## Message Endpoints

### Send Message
**POST** `/api/messages` 🔒

Send a message to a session.

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "content": "Hello everyone! Ready to discuss React hooks?",
    "sessionId": 1
  }'
```

**Response:**
```json
{
  "message": "Message sent successfully",
  "data": {
    "id": 1,
    "content": "Hello everyone! Ready to discuss React hooks?",
    "createdAt": "2025-09-13T09:24:14.076Z",
    "userId": 1,
    "sessionId": 1,
    "user": {
      "id": 1,
      "username": "testuser",
      "reputation": 0
    },
    "session": {
      "id": 1,
      "title": "React Hooks Discussion"
    }
  }
}
```

### Get Session Messages
**GET** `/api/messages/session/:sessionId`

Get all messages for a specific session.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 50)

```bash
curl -X GET http://localhost:3000/api/messages/session/1
```

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "content": "Hello everyone! Ready to discuss React hooks?",
      "createdAt": "2025-09-13T09:24:14.076Z",
      "userId": 1,
      "sessionId": 1,
      "user": {
        "id": 1,
        "username": "testuser",
        "reputation": 0
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "pages": 1
  }
}
```

### Get User Messages
**GET** `/api/messages/user/:userId`

Get messages by user across all sessions.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)

```bash
curl -X GET http://localhost:3000/api/messages/user/1
```

---

## AI Endpoints

### Generate Code
**POST** `/api/ai/generate-code` 🔒

Generate code using AI.

```bash
curl -X POST http://localhost:3000/api/ai/generate-code \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "prompt": "Create a React component for a todo list",
    "language": "javascript"
  }'
```

### Review Code
**POST** `/api/ai/review-code` 🔒

Get AI code review.

```bash
curl -X POST http://localhost:3000/api/ai/review-code \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "code": "function add(a, b) { return a + b; }",
    "language": "javascript"
  }'
```

### Explain Code
**POST** `/api/ai/explain-code` 🔒

Get AI code explanation.

```bash
curl -X POST http://localhost:3000/api/ai/explain-code \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "code": "const [state, setState] = useState(0);",
    "language": "javascript"
  }'
```

---

## Utility Endpoints

### Health Check
**GET** `/api/health`

Check API health status.

```bash
curl -X GET http://localhost:3000/api/health
```

### Ping
**GET** `/ping`

Simple ping endpoint.

```bash
curl -X GET http://localhost:3000/ping
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "error": "Access denied. No token provided."
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Something went wrong!"
}
```

---

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Notes

🔒 = Requires authentication
- JWT tokens expire in 7 days
- All timestamps are in ISO 8601 format
- Pagination uses 1-based indexing
- Maximum request body size: 10MB
- Rate limiting: 100 requests per minute per IP