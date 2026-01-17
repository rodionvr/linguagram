from flask import Flask, request, jsonify

app = Flask(__name__)


@app.route("/examples")
def examples():
    return {"examples":["Example1", "Example2", "Example3"]}

#@app.route("/translate", methods = ["POST"])
#ef translate():
    #message = request.get_json()



if __name__ == "__main__":
    app.run(debug = True)