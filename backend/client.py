# verify if actually good to pip install in github shared repository

from google import genai
import os

# put key in env. var, maybe would be better for all of us to hardcode it??? idk
client = genai.Client(api_key = os.getenv("GEMINI_API_KEY"))

response = client.models.generate_content(
    model = "gemini-2.5-flash",
    contents = "short summary of ai"
    )

print(response.text)