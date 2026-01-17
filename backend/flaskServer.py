from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from datetime import datetime
import os
from dotenv import load_dotenv
from translator import translate_with_context

load_dotenv()

app = Flask(__name__)
CORS(app)

# MongoDB connection
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/linguagram')
try:
    client = MongoClient(MONGODB_URI)
    db = client['linguagram']
    users_collection = db['users']
    print("✓ MongoDB connected")
except Exception as e:
    print(f"✗ MongoDB error: {e}")


@app.route("/api/users", methods=["POST"])
def save_user():
    """Save or update user from NextAuth login"""
    try:
        data = request.get_json()
        
        if not data or not data.get('email'):
            return jsonify({"error": "Email required"}), 400
        
        user_query = {"email": data['email']}
        user_data = {
            "email": data['email'],
            "name": data.get('name'),
            "image": data.get('image'),
            "provider": data.get('provider'),
            "providerId": data.get('providerId'),
            "updatedAt": datetime.utcnow(),
        }
        
        existing = users_collection.find_one(user_query)
        
        if existing:
            users_collection.update_one(user_query, {"$set": user_data})
            return jsonify({"message": "User updated"}), 200
        else:
            user_data["createdAt"] = datetime.utcnow()
            users_collection.insert_one(user_data)
            return jsonify({"message": "User created"}), 201
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/translate", methods = ["POST"])
def translate():
    data = request.get_json()
    message = data.get("message")   # variable to confirm
    language = data.get("language") #variable to confirm
    
    if not message or not language:
        return jsonify({"error": "Missing 'message' or 'language' parameter"}), 400


    translated = translate_with_context(message, language)
    
    return jsonify({
       "translatedMessage": translated
   })



if __name__ == "__main__":
    app.run(debug = True)