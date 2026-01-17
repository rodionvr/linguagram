from flask import Flask, request, jsonify
from translator import translate_with_context

app = Flask(__name__)


@app.route("/translate", methods = ["POST"])
def translate():
    data = request.get_json()
    message = data.get("message")   # variable to confirm
    language = data.get("language") #variable to confirm
    
    if not message or not language:
        return jsonify({"error": "Missing 'message' or 'language' parameter"}), 400


    translated = translator.translate_with_context(message, language)
    
    return jsonify({
       "translatedMessage": translated
   })



if __name__ == "__main__":
    app.run(debug = True)