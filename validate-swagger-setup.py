#!/usr/bin/env python3
"""
Validates that the Swagger setup has correct syntax
"""
import ast
import sys

def validate_python_syntax(file_path):
    """Check if Python file has valid syntax"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)
        return True, "Syntax is valid"
    except SyntaxError as e:
        return False, f"Syntax error at line {e.lineno}: {e.msg}"
    except Exception as e:
        return False, f"Error: {e}"

def check_swagger_requirements():
    """Check if flasgger is in requirements.txt"""
    try:
        with open('backend/requirements.txt', 'r') as f:
            requirements = f.read()
        if 'flasgger' in requirements:
            return True, "flasgger found in requirements.txt"
        else:
            return False, "flasgger NOT found in requirements.txt"
    except Exception as e:
        return False, f"Could not read requirements.txt: {e}"

def main():
    print("Validating Swagger Setup...\n")
    
    all_checks_passed = True
    
    # Check Python syntax
    print("1. Checking app.py syntax...")
    syntax_valid, syntax_msg = validate_python_syntax('backend/app.py')
    if syntax_valid:
        print(f"   [OK] {syntax_msg}")
    else:
        print(f"   [FAIL] {syntax_msg}")
        all_checks_passed = False
    
    # Check requirements
    print("\n2. Checking requirements.txt...")
    req_valid, req_msg = check_swagger_requirements()
    if req_valid:
        print(f"   [OK] {req_msg}")
    else:
        print(f"   [FAIL] {req_msg}")
        all_checks_passed = False
    
    print("\n" + "="*60)
    if all_checks_passed:
        print("[SUCCESS] All validation checks passed!")
        print("\nNext steps:")
        print("1. Install dependencies: pip install -r backend/requirements.txt")
        print("2. Start the backend: python backend/app.py")
        print("3. Access Swagger UI: http://localhost:5000/apidocs")
        print("4. Run test: python test-swagger.py")
        return 0
    else:
        print("[FAILED] Some validation checks failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())
