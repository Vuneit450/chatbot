from flask import Flask, request

app = Flask(__name__)

@app.route("/")  
def home():
    return "¡Hola! Este es tu chatbot básico. Todo está funcionando correctamente."

@app.route("/hello")  
def hello():
    return "Hello, World!"

@app.route("/ask")  # Ruta para hacer preguntas
def ask():
    question = request.args.get("question")  # Obtener la pregunta de los parámetros de la URL
    if question:
        # Respuestas condicionales
        if question.lower() == "hola":
            return "Hola, en qué puedo ayudarte"
        elif question.lower() == "spotify":
            return "Claro, los precios de Spotify son los siguientes:"
        elif question.lower() == "netflix":
            return "Claro, tenemos los tres meses en:"
        elif question == "-1":
            return "Uno"
        elif question == "-2":
            return "Dos"
        elif question == "-3":
            return "Tres"
        else:
            return "Lo siento, no entiendo la pregunta."
    else:
        return "Por favor, proporciona una pregunta."

if __name__ == "__main__":
    app.run(debug=True)
