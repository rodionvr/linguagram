from flask import Flask, request, jsonify, flash, render_template, redirect, url_for
from flask_login import login_user, login_required, logout_user
from werkzeug.security import check_password_hash, generate_password_hash
import translator
from forms import LoginForm, RegisterForm

app = Flask(__name__)
app.config["SECRET_KEY"] = "placeholder"



# register endpoint
@app.route("/register", methods = ["GET", "POST"])
def register():
    form = RegisterForm()
    if form.validate_on_submit():
        user = users_collection.find_one({"email": form.email.data})
        if user:
            flash("Email already registered. Please try again.", "error")
        else:
            if form.validate_on_submit():
                # Create new user
                new_user = {
                    "username": form.username.data,
                    "email": form.email.data,
                    "password": generate_password_hash(form.password.data)
                }
                users_collection.insert_one(new_user)
                flash("Registration successful!", "success")
                return redirect(url_for("login"))

    return render_template("register.html", form=form)


# login endpoint
@app.route("/login", methods = ["POST"])
def login():
    form = LoginForm()
    if form.validate_on_submit():
        user = users_collection.find_one({"email": form.email.data})
        if not user:
            flash("Email not found. Please try again.", "error")
        else:
            if check_password_hash(user.password, form.password.data):
                login_user(user)
                flash("Login successful!", "success")
                return redirect(url_for("login"))
            else:
                flash("Incorrect password. Please try again.", "error")

        return render_template("login.html", form=form)


# logout endpoint
@app.route("/logout", methods = ["GET"])
@login_required
def logout():
    logout_user()
    flash("Logged out successfully","success")
    return redirect(url_for("login"))



# timestamp endpoint
@app.route()




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

# store in database --- MongoDB
#translation_doc = {
 #   "original_message": new_message,
  #  "target_language": target_language,
   # "translated_message": translated
    #"timestamp": datetime.utcnow(),
#}

#translations_collection.insert_one(translation_doc)


if __name__ == "__main__":
    app.run(debug = True)