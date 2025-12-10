#Pomodoro API contract

Base URL: `http://localhost:3000`

All JSON error responses follow this shape:

````json
{
  "status": "error",
  "message": "custom error msg..."
}

## Health:

GET /health
Purpose: Check if backend is alive
Auth:  Not required
Response 200
{
  "status": "ok"
}

## Auth:

- Google OAuth:

GET /api/auth/google
Behaviour: Start Google login
Purpose: Redirects user to Google login
Auth: Not required
Response: 200 redirect to Google

- Google callback:

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

- Get current user:

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

## Logout:

POST /api/auth/logout
Purpose: Log out the current user
Auth: Session cookie required
Success 200
Behaviour: Redirects to /


### Dashboard

GET /api/dashboard
- Purpose: Fetch all data needed to render the user's dashboard (profile summary, week progress, weekly activity aggregates, and today's sessions).
- Auth: Session cookie required (connect.sid). Frontend must send credentials
- Query params: none (server returns data for the authenticated user).
- Response 200 — shape (example):
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "longstring",
      "name": "Steve Jobs",
      "avatar_url": "https://example.com/avatar.png",
      "timezone": "Australia/Melbourne",
      "settings": {}
    },
    "week_progress": {
      "scheduled_count": 6,
      "completed_count": 4
    },
    "weekly_activities": [
      {
        "date": "2025-11-17",
        "focus_minutes": 90
      }
    ],
    "today": {
      "date": "2025-11-21T00:00:00.000Z",
      "sessions": [
        {
          "id": "randomstring",
          "name": "Morning Deep Work",
          "start_at": "2025-11-21T09:00:00.000Z",
          "end_at": null,
          "status": "SCHEDULED",
          "break_time": 0,
          "tag": {
            "id": "randomstring",
            "name": "Deep Work",
            "color": "#FF5A5A"
          }
        }
      ]
    }
  }
}


### Upcoming

Routes: /api/upcoming
Auth: Session cookie required (connect.sid). Frontend must send credentials
All timestamps are ISO 8601 strings. Frontend should convert local datetimes to UTC ISO when sending requests.

GET /api/upcoming
- Purpose: List future scheduled sessions for the authenticated user.
- Query params: none
- Response 200 — example:
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "name": "Plan Sprint",
      "start_at": "2025-12-10T09:00:00.000Z",
      "end_at": null,
      "status": "SCHEDULED",
      "break_time": 0,
      "tag": { "id": "tag-uuid", "name": "Work", "color": "#FF5A5A" }
    }
  ]
}
```

POST /api/upcoming
- Purpose: Create a new scheduled session (status = SCHEDULED).
- Body (JSON):
```json
{
  "name": "Morning Focus",
  "start_at": "2025-12-10T09:00:00.000Z",
  "end_at": null,
  "tag_id": "existing-tag-uuid",
  "new_tag_name": "Deep Work",
  "new_tag_color": "#00FF00"
}
```
- Validations:
  - start_at required and must be a valid future ISO timestamp.
  - If creating a new tag, both new_tag_name and new_tag_color must be provided.
  - Either tag_id or new_tag_name/new_tag_color must be provided.
- Response 201 — example:
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "name": "Morning Focus",
    "start_at": "2025-12-10T09:00:00.000Z",
    "end_at": null,
    "status": "SCHEDULED",
    "break_time": 0,
    "tag": { "id": "tag-uuid", "name": "Deep Work", "color": "#00FF00" }
  }
}
```

PATCH /api/upcoming/:id
- Purpose: Partially update a scheduled session. Only sessions with status SCHEDULED can be edited.
- Params: id (session id)
- Body (JSON) — any subset:
```json
{
  "name": "Updated name",          // optional; set to null to clear
  "start_at": "2025-12-11T10:00:00.000Z", // optional; must be a future ISO date
  "tag_id": "existing-tag-uuid"    // optional; must belong to user
}
```
- Constraints:
  - end_at cannot be edited (rejects any attempt to set/update).
  - start_at must be a valid future date if present.
  - tag_id must belong to the authenticated user.
  - Only sessions with status SCHEDULED are editable.
- Response 200 — example:
```json
{
  "status": "success",
  "data": {
    "session": {
      "id": "uuid",
      "name": "Updated name",
      "start_at": "2025-12-11T10:00:00.000Z",
      "end_at": null,
      "status": "SCHEDULED",
      "break_time": 0,
      "tag": { "id": "tag-uuid", "name": "Work", "color": "#FF5A5A" }
    }
  }
}
```

DELETE /api/upcoming/:id
- Purpose: Delete an upcoming scheduled session. Only SCHEDULED sessions can be removed.
- Params: id (session id)
- Response: 204 No Content on success.

### Dashboard

GET /api/dashboard
- Purpose: Fetch all data needed to render the user's dashboard (profile summary, week progress, weekly activity aggregates, and today's sessions).
- Auth: Session cookie required (connect.sid). Frontend must send credentials.

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "longstring",
      "name": "Steve Jobs",
      "avatar_url": "https://example.com/avatar.png",
      "timezone": "Australia/Melbourne",
      "settings": {}
    },
    "week_progress": {
      "scheduled_count": 6,
      "completed_count": 4
    },
    "weekly_activities": [
      {
        "date": "2025-11-17",
        "focus_minutes": 90
      },
      {
        "date": "2025-11-18",
        "focus_minutes": 45
      }
    ],
    "today": {
      "date": "2025-11-21T00:00:00.000Z",
      "sessions": [
        {
          "id": "randomstring",
          "name": "Morning Deep Work",
          "start_at": "2025-11-21T09:00:00.000Z",
          "end_at": null,
          "status": "SCHEDULED",
          "break_time": 0,
          "tag": {
            "id": "tag-random",
            "name": "Deep Work",
            "color": "#FF5A5A"
          }
        }
      ]
    }
  }
}

````
