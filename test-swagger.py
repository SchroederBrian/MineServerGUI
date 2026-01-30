#!/usr/bin/env python3
"""
Simple test script to verify Swagger UI is accessible
"""
import requests
import sys

def test_swagger_ui():
    """Test if Swagger UI endpoints are accessible"""
    base_url = "http://localhost:5000"
    
    endpoints_to_test = [
        ("/apidocs", "Swagger UI page"),
        ("/apispec.json", "OpenAPI specification")
    ]
    
    print("Testing Swagger UI accessibility...\n")
    
    all_passed = True
    for endpoint, description in endpoints_to_test:
        url = f"{base_url}{endpoint}"
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                print(f"[OK] {description}: {url} - OK (Status: {response.status_code})")
            else:
                print(f"[FAIL] {description}: {url} - FAILED (Status: {response.status_code})")
                all_passed = False
        except requests.exceptions.ConnectionError:
            print(f"[FAIL] {description}: {url} - CONNECTION FAILED")
            print("  Make sure the Flask backend is running!")
            all_passed = False
        except Exception as e:
            print(f"[FAIL] {description}: {url} - ERROR: {e}")
            all_passed = False
    
    print("\n" + "="*60)
    if all_passed:
        print("SUCCESS! Swagger UI is properly configured.")
        print(f"\nAccess Swagger UI at: {base_url}/apidocs")
        return 0
    else:
        print("FAILED! Some endpoints are not accessible.")
        print("\nMake sure:")
        print("1. Flask backend is running (python app.py)")
        print("2. Flasgger is installed (pip install flasgger)")
        print("3. Backend is accessible at http://localhost:5000")
        return 1

if __name__ == "__main__":
    sys.exit(test_swagger_ui())
