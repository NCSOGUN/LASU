# API documentation fixture contract

Every capture agent writes one JSON file under `docs/api/fixtures/`. The HTML
builder reads all files, merges them by `order`, and renders the Postman-style
reference. Examples must be **real responses captured from the running API**, not
invented. Sanitize credentials before writing.

## Rules

1. Use `http://localhost:3000/v1` unless a step needs another origin.
2. Capture the real HTTP status, content type and JSON body. Keep field names and
   types exactly as returned.
3. Replace any live `access_token`, `refresh_token`, OTP and session cookie with a
   placeholder such as `"<access-jwt>"`. Never write a usable token to disk.
4. Demo patient data is allowed: `demo.patient@example.test`, patient code
   `123456789012`, demo facilities. Do not include real user data.
5. Include at least one success response per endpoint and the important error
   responses (400, 401, 403, 404, 409, 503) where they are part of the contract.
6. For `multipart/form-data`, list fields instead of embedding a file. Use
   `bodyExample` only for JSON bodies.
7. Keep endpoint ids unique across all fixture files (prefix with the group, e.g.
   `auth-register`, `portal-grants-create`, `meds-schedule-create`).

## File shape

```json
{
  "group": "Authentication",
  "order": 10,
  "description": "Short group description.",
  "endpoints": [
    {
      "id": "auth-register",
      "name": "Register a patient",
      "method": "POST",
      "path": "/auth/register",
      "summary": "One-line purpose.",
      "description": "Longer description, constraints and side effects.",
      "auth": "none",
      "roles": [],
      "contentType": "application/json",
      "pathParams": [
        { "name": "id", "type": "uuid", "required": true, "description": "..." }
      ],
      "queryParams": [
        { "name": "page", "type": "integer", "required": false, "default": 1, "description": "..." }
      ],
      "bodyExample": {
        "firstName": "Ada",
        "lastName": "Okafor",
        "email": "ada@example.test",
        "password": "DemoPass123!",
        "password_confirmation": "DemoPass123!"
      },
      "bodyFields": [
        { "name": "email", "type": "string", "required": true, "description": "Lower-case unique email." }
      ],
      "responses": [
        {
          "status": 201,
          "label": "Created",
          "description": "Account, roles and token pair.",
          "headers": { "content-type": "application/json" },
          "body": {
            "account": { "id": "uuid", "email": "ada@example.test" },
            "roles": ["PATIENT"],
            "tokens": { "access_token": "<access-jwt>", "refresh_token": "<refresh-token>" }
          }
        }
      ],
      "curl": "curl -sS -X POST http://localhost:3000/v1/auth/register -H 'content-type: application/json' -d '{...}'",
      "notes": ["Any frontend-relevant caveat."]
    }
  ]
}
```

## Required fields

`id`, `name`, `method`, `path`, `summary`, `auth`, `responses`.
Optional: `description`, `roles`, `contentType`, `pathParams`, `queryParams`,
`bodyExample`, `bodyFields`, `curl`, `notes`.

`auth` is `"none"` or `"bearer"`. `roles` lists required roles for role-gated
endpoints. `responses[].body` must be valid JSON. Use `null` for an empty body.
