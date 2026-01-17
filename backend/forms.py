from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, SubmitField
from wtforms.validators import InputRequired, Length, Email


class RegisterForm(FlaskForm):
    username = StringField("Username", validators = [InputRequired(), Length(min = 4, max = 20)])
    email = StringField("Email", validators = [InputRequired(), Email()])
    password = PasswordField("Password", validators = [InputRequired(), Length(min = 6)])
    submit = SubmitField("Register")


class LoginForm(FlaskForm):
    email = StringField("Email", validators = [InputRequired(), Email()])
    password = PasswordField("Password", validators = [InputRequired(), Length(min = 6)])
    submit = SubmitField("Login")


