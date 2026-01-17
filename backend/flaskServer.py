from flask import Flask, request, jsonify, flash, render_template, redirect, url_for
from flask_login import login_user, login_required, logout_user
import os
from datetime import datetime
from pymongo import MongoClient


app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "placeholder")

try:
    import translator
except Exception:
    translator = None


# Load a local .env next to this file if present (simple loader)
def _load_local_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip()
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1]
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception:
        pass


_load_local_env()

# Mongo setup
_mongo_uri = os.environ.get("MONGO_URI") or os.environ.get("MONGODB_URI")
_mongo_db = os.environ.get("MONGO_DB_NAME", "linguagram")
_mongo_client = None
if _mongo_uri:
    try:
        _mongo_client = MongoClient(_mongo_uri)
    except Exception:
        _mongo_client = None


def _get_accounts_collection():
    if _mongo_client:
        return _mongo_client[_mongo_db]["accounts"]
    return None


# login endpoint
@app.route("/login", methods=["GET", "POST"])
def login():
    # Accept either query params or JSON body
    data = request.get_json(silent=True) or request.args
    username = data.get("name")
    email = data.get("email")

    if not email:
        return jsonify({"error": "Missing 'email' parameter"}), 400

    accounts = _get_accounts_collection()
    if accounts is None:
        return jsonify({"error": "Database not configured. Set MONGO_URI in environment or backend/.env"}), 500

    # Check for existing account by email (index Email_1 assumed present)
    existing = accounts.find_one({"email": email})
    if existing:
        existing.pop("_id", None)
        return jsonify({"created": False, "user": existing}), 200

    # Create new account document inserted into `accounts` collection
    user_doc = {
        "username": username or "",
        "email": email,
        "friends": [],
        "language": "",
    }

    try:
        accounts.insert_one(user_doc)
    except Exception as e:
        return jsonify({"error": "Failed to create account: " + str(e)}), 500

    user_doc.pop("_id", None)
    return jsonify({"created": True, "user": user_doc}), 201

# logout endpoint
@app.route("/logout", methods=["GET"])
@login_required
def logout():
    logout_user()
    flash("Logged out successfully", "success")
    return redirect(url_for("login"))





# translate endpoint
@app.route("/translate", methods = ["GET"])
def translate():
    new_message = request.args.get("new_message")   # variable to confirm
    target_language = request.args.get("target_language") #variable to confirm
    
    if not new_message or not target_language:
        return jsonify({"error": "Missing 'message' or 'language' parameter"}), 400


    #  currently, function needs three args, but only have two rn
    # leaving it as is for now
    translated = translator.translate_with_context(new_message, target_language)
    
    return jsonify({
       "translatedMessage": translated
   })

if __name__ == "__main__":
    app.run(debug = True)