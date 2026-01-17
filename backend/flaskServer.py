from flask import Flask, request, jsonify, flash, render_template, redirect, url_for
from flask_cors import CORS
from flask_login import login_user, login_required, logout_user
from flask_socketio import SocketIO, join_room, leave_room, emit
import os
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId


app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("FLASK_SECRET_KEY", "placeholder")

# Enable CORS for frontend development (allow all origins for now)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Socket.IO for realtime chat
socketio = SocketIO(app, cors_allowed_origins="*")

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

def _get_conversations_collection():
    if _mongo_client:
        return _mongo_client[_mongo_db]["conversations"]
    return None

def _get_messages_collection():
    if _mongo_client:
        return _mongo_client[_mongo_db]["messages"]
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
        "language": "",
    }

    try:
        accounts.insert_one(user_doc)
    except Exception as e:
        return jsonify({"error": "Failed to create account: " + str(e)}), 500

    user_doc.pop("_id", None)
    return jsonify({"created": True, "user": user_doc}), 201

@app.route("/message", methods=["POST"])
def message():
    data = request.get_json(silent=True)
    message_text = data.get("message")
    user_email = data.get("email")
    target_email = data.get("target_email")

    if not message_text or not user_email or not target_email:
        return jsonify({"error": "Missing 'message', 'email', or 'target_email' parameter"}), 400

    accounts = _get_accounts_collection()
    conversations = _get_conversations_collection()
    messages = _get_messages_collection()
    if accounts is None or conversations is None or messages is None:
        return jsonify({"error": "Database not configured. Set MONGO_URI in environment or backend/.env"}), 500

    # Find the user by email
    user = accounts.find_one({"email": user_email})
    if not user:
        return jsonify({"error": "User not found"}), 404
    target = accounts.find_one({"email": target_email})
    if not target:
        return jsonify({"error": "Target user not found"}), 404
    # Determine participant ids
    sender_id = user.get("_id")
    target_id = target.get("_id")

    # Find or create a conversation between the two participants
    try:
        conv = conversations.find_one({"participants": {"$all": [sender_id, target_id]}})
        if not conv:
            conv_doc = {
                "participants": [sender_id, target_id],
                "created_at": datetime.now(),
                "latest": None,
            }
            conv_result = conversations.insert_one(conv_doc)
            conv_id = conv_result.inserted_id
        else:
            conv_id = conv.get("_id")
    except Exception as e:
        return jsonify({"error": "Failed to find/create conversation: " + str(e)}), 500

    # Determine recipient language (from their account) for translation
    recv_lang = target.get("language") or None

    # Perform translation if translator available and recv_lang provided
    translated_text = None
    try:
        if translator is not None and recv_lang:
            # translator.translate_with_context(new_message, prev_messages, target_language)
            translated_text = translator.translate_with_context(message_text, None, recv_lang)
        else:
            translated_text = message_text
    except Exception:
        # fallback to original text on translation failure
        translated_text = message_text

    # Create message document
    msg_doc = {
        "conversation_id": conv_id,
        "sender_id": sender_id,
        "timestamp": datetime.now(),
        "original_language": user.get("language", ""),
        "original_text": message_text,
        "translated_language": recv_lang or "",
        "translated_text": translated_text,
    }

    try:
        msg_res = messages.insert_one(msg_doc)
    except Exception as e:
        return jsonify({"error": "Failed to insert message: " + str(e)}), 500

    # Update conversation's latest message metadata
    try:
        latest_info = {
            "timestamp": msg_doc["timestamp"],
            "language": recv_lang or "",
            "sender_id": sender_id,
            "message_id": msg_res.inserted_id,
        }
        conversations.update_one({"_id": conv_id}, {"$set": {"latest": latest_info, "updated_at": datetime.utcnow()}})
    except Exception:
        # non-fatal: message already saved
        pass

    return jsonify({"message": "Message added successfully", "message_id": str(msg_res.inserted_id), "conversation_id": str(conv_id)}), 201

# logout endpoint
@app.route("/logout", methods=["GET"])
@login_required
def logout():
    logout_user()
    flash("Logged out successfully", "success")
    return redirect(url_for("login"))

@app.route("/getConvs", methods = ["GET"])
def get_conversations():
    user_email = request.args.get("email")
    if not user_email:
        return jsonify({"error": "Missing 'email' parameter"}), 400

    accounts = _get_accounts_collection()
    conversations = _get_conversations_collection()
    if accounts is None or conversations is None:
        return jsonify({"error": "Database not configured. Set MONGO_URI in environment or backend/.env"}), 500

    # Find the user by email
    user = accounts.find_one({"email": user_email})
    if not user:
        return jsonify({"error": "User not found"}), 404

    user_id = user.get("_id")

    try:
        convs_cursor = conversations.find({"participants": user_id}).sort("updated_at", -1)
        convs_list = []
        for conv in convs_cursor:
            conv["_id"] = str(conv["_id"])
            convs_list.append(conv)
    except Exception as e:
        return jsonify({"error": "Failed to retrieve conversations: " + str(e)}), 500

    return jsonify({"conversations": convs_list}), 200

@app.route("/getMessages", methods = ["GET"])
def get_messages():
    # Expected query params: email (caller email), conversation_id
    user_email = request.args.get("email")
    conv_id = request.args.get("conversation_id")

    if not user_email or not conv_id:
        return jsonify({"error": "Missing 'email' or 'conversation_id' parameter"}), 400

    accounts = _get_accounts_collection()
    conversations = _get_conversations_collection()
    messages = _get_messages_collection()
    if accounts is None or conversations is None or messages is None:
        return jsonify({"error": "Database not configured. Set MONGO_URI in environment or backend/.env"}), 500

    # Find caller
    user = accounts.find_one({"email": user_email})
    if not user:
        return jsonify({"error": "User not found"}), 404
    user_id = user.get("_id")
    user_lang = user.get("language") or ""

    # Validate conversation exists and caller is a participant
    try:
        conv_obj_id = ObjectId(conv_id)
    except Exception:
        return jsonify({"error": "Invalid conversation_id"}), 400

    conv = conversations.find_one({"_id": conv_obj_id})
    if not conv:
        return jsonify({"error": "Conversation not found"}), 404

    if user_id not in conv.get("participants", []):
        return jsonify({"error": "User not a participant in conversation"}), 403

    # Fetch messages for conversation (ascending)
    try:
        msgs_cursor = messages.find({"conversation_id": conv_obj_id}).sort("timestamp", 1)
    except Exception as e:
        return jsonify({"error": "Failed to query messages: " + str(e)}), 500

    out = []
    for m in msgs_cursor:
        sender_id = m.get("sender_id")
        is_sender = (sender_id == user_id)

        # If caller is sender -> show original_text
        if is_sender:
            display_text = m.get("original_text")
            display_lang = m.get("original_language") or ""
        else:
            # message from other participant: prefer translated_text if it matches user's language
            msg_trans_lang = m.get("translated_language") or ""
            if msg_trans_lang == user_lang and m.get("translated_text"):
                display_text = m.get("translated_text")
                display_lang = msg_trans_lang
            else:
                # Need to translate into user's language (if translator available)
                orig = m.get("original_text")
                if translator is not None and user_lang:
                    try:
                        new_trans = translator.translate_with_context(orig, None, user_lang)
                        # persist the new translation for this message
                        try:
                            messages.update_one({"_id": m.get("_id")}, {"$set": {"translated_language": user_lang, "translated_text": new_trans}})
                        except Exception:
                            pass
                        display_text = new_trans
                        display_lang = user_lang
                    except Exception:
                        # translation failed -> fall back to original
                        display_text = orig
                        display_lang = m.get("original_language") or ""
                else:
                    # translator not available or user_lang not set -> show original
                    display_text = m.get("original_text")
                    display_lang = m.get("original_language") or ""

        out.append({
            "message_id": str(m.get("_id")),
            "conversation_id": str(m.get("conversation_id")),
            "sender_id": str(m.get("sender_id")),
            "timestamp": m.get("timestamp").isoformat() if m.get("timestamp") else None,
            "language": display_lang,
            "text": display_text,
        })

    return jsonify({"messages": out}), 200
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
    # Use SocketIO runner so websocket handlers work
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)


# --- Socket.IO event handlers ---


@socketio.on("join")
def handle_join(data):
    """Client sends {conversation_id, email} to join a room for that conversation."""
    conv_id = data.get("conversation_id")
    if not conv_id:
        return
    join_room(conv_id)
    emit("joined", {"conversation_id": conv_id}, room=conv_id)


@socketio.on("leave")
def handle_leave(data):
    conv_id = data.get("conversation_id")
    if not conv_id:
        return
    leave_room(conv_id)


@socketio.on("send_message")
def handle_send_message(data):
    """Expect data: {message, email, target_email, conversation_id (optional)}
    Will create/find conversation, persist message, update conversation.latest,
    and emit 'message' event to the conversation room with the stored message.
    """
    message_text = data.get("message")
    user_email = data.get("email")
    target_email = data.get("target_email")
    conv_id = data.get("conversation_id")

    if not message_text or not user_email or not target_email:
        emit("error", {"error": "Missing parameters"})
        return

    accounts = _get_accounts_collection()
    conversations = _get_conversations_collection()
    messages = _get_messages_collection()
    if accounts is None or conversations is None or messages is None:
        emit("error", {"error": "Database not configured"})
        return

    user = accounts.find_one({"email": user_email})
    target = accounts.find_one({"email": target_email})
    if not user or not target:
        emit("error", {"error": "User or target not found"})
        return

    sender_id = user.get("_id")
    target_id = target.get("_id")

    # Use provided conversation_id if valid, otherwise find or create
    conv_obj_id = None
    if conv_id:
        try:
            conv_obj_id = ObjectId(conv_id)
        except Exception:
            conv_obj_id = None

    try:
        if conv_obj_id:
            conv = conversations.find_one({"_id": conv_obj_id})
            if not conv:
                conv_obj_id = None
        if not conv_obj_id:
            conv = conversations.find_one({"participants": {"$all": [sender_id, target_id]}})
            if not conv:
                conv_doc = {"participants": [sender_id, target_id], "created_at": datetime.utcnow(), "latest": None}
                conv_res = conversations.insert_one(conv_doc)
                conv_obj_id = conv_res.inserted_id
            else:
                conv_obj_id = conv.get("_id")
    except Exception as e:
        emit("error", {"error": f"Failed to find/create conversation: {e}"})
        return

    recv_lang = target.get("language") or None

    # translation
    translated_text = message_text
    try:
        if translator is not None and recv_lang:
            translated_text = translator.translate_with_context(message_text, None, recv_lang)
    except Exception:
        translated_text = message_text

    # create message doc
    msg_doc = {
        "conversation_id": conv_obj_id,
        "sender_id": sender_id,
        "timestamp": datetime.utcnow(),
        "original_language": user.get("language", ""),
        "original_text": message_text,
        "translated_language": recv_lang or "",
        "translated_text": translated_text,
    }

    try:
        msg_res = messages.insert_one(msg_doc)
    except Exception as e:
        emit("error", {"error": f"Failed to insert message: {e}"})
        return

    # update conversation latest
    try:
        latest_info = {"timestamp": msg_doc["timestamp"], "language": recv_lang or "", "sender_id": sender_id, "message_id": msg_res.inserted_id}
        conversations.update_one({"_id": conv_obj_id}, {"$set": {"latest": latest_info, "updated_at": datetime.utcnow()}})
    except Exception:
        pass

    out_msg = {
        "message_id": str(msg_res.inserted_id),
        "conversation_id": str(conv_obj_id),
        "sender_id": str(sender_id),
        "timestamp": msg_doc["timestamp"].isoformat(),
        "original_text": message_text,
        "translated_text": translated_text,
        "translated_language": recv_lang or "",
    }

    # emit to room
    room_name = str(conv_obj_id)
    emit("message", out_msg, room=room_name)