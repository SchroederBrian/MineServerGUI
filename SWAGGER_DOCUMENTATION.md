# Swagger API Documentation for MineServerGUI

## Overview

The MineServerGUI now includes interactive Swagger/OpenAPI documentation for all API endpoints. This provides:
- Interactive API testing directly in your browser
- Automatic request/response examples
- Complete endpoint documentation
- Authentication support (Bearer tokens + Session-based auth)

## Accessing Swagger UI

Once the backend is running, access the Swagger UI at:

```
http://localhost:5000/apidocs
```

The OpenAPI specification (JSON) is available at:

```
http://localhost:5000/apispec.json
```

## Setup Instructions

### 1. Install Dependencies

Make sure Flasgger is installed:

```bash
cd backend
pip install -r requirements.txt
```

Or install it directly:

```bash
pip install flasgger
```

### 2. Start the Backend

Start the Flask backend as usual:

```bash
# On Windows with WSL
cd backend
wsl
python app.py
```

Or directly:

```bash
cd backend
python app.py
```

### 3. Access Swagger UI

Open your browser and navigate to:

```
http://localhost:5000/apidocs
```

## Using Swagger UI

### Authentication

The API supports two authentication methods:

1. **Session-based Authentication** (via login)
   - Use the `/api/auth/login` endpoint first
   - Browser cookies will handle authentication automatically

2. **OAuth2 Bearer Token**
   - Click the "Authorize" button in Swagger UI
   - Enter your Bearer token in the format: `Bearer <your-token>`
   - Click "Authorize"

### Testing Endpoints

1. Navigate to any endpoint in the Swagger UI
2. Click "Try it out"
3. Fill in required parameters
4. Click "Execute"
5. View the response below

## API Organization

Endpoints are organized into the following categories:

- **Authentication** - Login, logout, OAuth2, setup
- **Servers** - Server CRUD operations, start/stop/restart
- **Files** - File management, logs, console access
- **Admin** - User management, groups, permissions
- **Settings** - Application settings and configuration

## Documented Endpoints

The following key endpoints are fully documented:

### Authentication
- `GET /api/auth/setup-required` - Check if initial setup is needed
- `POST /api/auth/setup` - Create first admin user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/status` - Check authentication status

### Servers
- `GET /api/servers` - List all servers
- `POST /api/servers` - Create a new server
- `GET /api/servers/{server_name}/status` - Get server status
- `POST /api/servers/{server_name}/{action}` - Start/stop/restart server

## Adding Documentation to New Endpoints

To document a new endpoint, add a YAML docstring to the function:

```python
@app.route('/api/your-endpoint', methods=['GET'])
@api_auth_required
def your_endpoint(api_user=None):
    """Your Endpoint Title
    ---
    tags:
      - YourCategory
    security:
      - Bearer: []
      - Session: []
    parameters:
      - name: param_name
        in: query
        type: string
        required: true
        description: Parameter description
    responses:
      200:
        description: Success response
        schema:
          type: object
          properties:
            result:
              type: string
      401:
        description: Authentication required
    """
    # Your endpoint logic here
```

## Validation and Testing

### Validate Setup

Run the validation script to ensure everything is configured correctly:

```bash
python validate-swagger-setup.py
```

### Test Swagger Endpoints

Run the test script to verify Swagger UI is accessible:

```bash
python test-swagger.py
```

## Configuration

Swagger is configured in `backend/app.py` with the following settings:

- **Swagger UI Route**: `/apidocs`
- **OpenAPI Spec Route**: `/apispec.json`
- **Static Files Route**: `/flasgger_static`
- **OpenAPI Version**: 2.0

## Troubleshooting

### Swagger UI doesn't load

1. Ensure the backend is running: `python backend/app.py`
2. Check that flasgger is installed: `pip list | grep flasgger`
3. Verify no firewall is blocking port 5000
4. Check browser console for errors

### Import errors when starting backend

Install all dependencies:

```bash
pip install -r backend/requirements.txt
```

### Endpoints not showing in Swagger

1. Ensure the endpoint function has a docstring with `---` separator
2. Restart the Flask backend
3. Clear browser cache and reload

## Benefits

- **Interactive Testing**: Test API endpoints without writing code
- **Documentation**: Auto-generated API documentation
- **Type Safety**: Request/response schemas with validation
- **Authentication**: Built-in support for multiple auth methods
- **Developer Friendly**: Easy to add documentation to new endpoints

## Next Steps

- Gradually add documentation to remaining endpoints
- Add more detailed response schemas
- Include example requests/responses
- Document error codes and edge cases

## Resources

- [Flasgger Documentation](https://github.com/flasgger/flasgger)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
