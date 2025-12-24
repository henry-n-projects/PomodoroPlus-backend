#Pomodoro API contract

Base URL: `http://localhost:3000`

```json
Error:
{
  "status": "error",
  "message": "custom error msg..."
}

GET /health
Purpose: Check if backend is alive
Auth:  Not required
Response 200
{
  "status": "ok"
}

GET /api/auth/google
Behaviour: Start Google login
Purpose: Redirects user to Google login
Auth: Not required
Response: 200 redirect to Google

GET /api/auth/google/callback
Purpose: Google redirects back here after login
Auth: Not required (Google handles auth)
Behavior:
  On success:
    Creates/loads user in DB
    Creates session
    Sets a session cookie (connect.sid)
    Redirects to frontend: process.env.FRONTEND_URL
  On failure:
    Redirects to /login

GET /api/auth/me
Purpose: Get the currently logged-in user
Auth: Session cookie required (connect.sid)
Success 200
Body:
{
  "id": "string-uuid",
  "auth_user_id": "google-profile-id",
  "name": "Steve Jobs",
  "avartar_url": "https://... or null",
  "timezone": "UTC",
  "settings": {}
}
Fail 401
{
  "error": "Not authenticated"
}

POST /api/auth/logout
Purpose: Log out the current user
Auth: yes
Success 200
Behaviour: Redirects to /


GET /api/dashboard
Method: GET
Path: /api/dashboard
Auth: yes
Response:
{
  "status": "success",
  "data": {
    "user": {
      "id": "string",
      "name": "string",
      "avatar_url": "string | null",
      "timezone": "string",
      "settings": "object"
    },
    "week_progress": {
      "scheduled_count": "number",
      "completed_count": "number"
    },
    "weekly_activities": [
      {
        "date": "string", // "YYYY-MM-DD"
        "focus_minutes": "number"
      }
    ],
    "today": {
      "date": "string", // ISO date string for start of day
      "sessions": [
        {
          "id": "string",
          "name": "string | null",
          "start_at": "string", // ISO-8601
          "end_at": "string | null",
          "status": "SessionStatus",
          "break_time": "number",
          "tag": {
            "id": "string",
            "name": "string",
            "color": "string"
          }
        }
      ]
    }
  }
}

GET /api/sessions/scheduled
Method: GET
Path: /api/sessions/scheduled
Auth: yes
Response (200):
{
  "status": "success",
  "data": [
    {
      "id": "string",
      "name": "string | null",
      "start_at": "string", // ISO-8601
      "end_at": "string | null", // ISO-8601 or null
      "status": "SessionStatus", // "SCHEDULED"
      "break_time": "number", // total break minutes (usually 0 for upcoming)
      "tag": {
        "id": "string",
        "name": "string",
        "color": "string"
      }
    }
  ]
}


POST /api/sessions/:id/start
Method: POST
Auth: yes
Response (200):
{
  "status": "success",
  "data": {
    "id": "string", // session id
    "status": "IN_PROGRESS", // new status
    "start_at": "string" // ISO-8601 actual start time
  }
}


POST /api/sessions/:id/stop
Method: POST
Auth: yes
Response (200):
{
  "status": "success",
  "data": {
    "session": {
      "id": "string", // session id
      "status": "COMPLETED", // new status
      "start_at": "string", // ISO-8601
      "end_at": "string | null", // ISO-8601 (stop time)
      "break_time": "number" // total break minutes
    }
  }
}


POST /api/sessions/:id/breaks/start
Method: POST
Path: /api/sessions/:id/breaks/start
Auth: yes
Response (201):
{
  "status": "success",
  "data": {
    "break": {
      "id": "string", // break id
      "start_time": "string", // ISO-8601
      "end_time": null // always null when just started
    }
  }
}


POST /api/sessions/:id/breaks/:breakId/end
Method: POST
Auth: yes
Response (200):
{
  "status": "success",
  "data": {
    "break": {
      "id": "string", // break id
      "start_time": "string", // ISO-8601
      "end_time": "string | null", // ISO-8601 (end time)
      "duration_minutes": "number" // this break's duration in minutes
    },
    "session": {
      "id": "string", // session id
      "break_time": "number" // updated total break minutes for the session
    }
  }
}


GET /api/sessions/:id
Method: GET
Path: /api/sessions/:id
Auth: yes
Response (200):
{
  "status": "success",
  "data": {
    "session": {
      "id": "string",
      "name": "string | null",
      "status": "SessionStatus", // e.g. "SCHEDULED" | "IN_PROGRESS" | "COMPLETED"
      "start_at": "string", // ISO-8601
      "end_at": "string | null", // ISO-8601 or null if still running
      "break_time": "number", // total break minutes stored on session
      "tag": {
        "id": "string",
        "name": "string",
        "color": "string"
      }
    },
    "activity": {
      "total_minutes": "number", // total duration (end_or_now - start), rounded
      "focus_minutes": "number", // total_minutes - break_minutes
      "break_minutes": "number", // sum of all finished breaks (computed)
      "breaks": [
        {
          "id": "string",
          "start_time": "string", // ISO-8601
          "end_time": "string | null" // ISO-8601 or null if still running
        }
      ]
    }
  }
}
```
