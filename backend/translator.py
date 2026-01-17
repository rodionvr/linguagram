import os
import sys
from typing import List, Optional

try:
   from google import genai
except Exception as e:
   print("Error importing 'google.genai':", e)
   print("Install with: python -m pip install -U google-genai and ensure no local 'google' module shadows it.")
   raise


def _load_local_env():
   """Load a local .env file located next to this module into os.environ if keys are missing."""
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
            # remove surrounding quotes
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
               val = val[1:-1]
            if key and key not in os.environ:
               os.environ[key] = val
   except Exception:
      # don't crash on env parsing errors
      pass


# Load local .env early so GEMINI_API_KEY can be read from it
_load_local_env()


def _get_client() -> genai.Client:
   api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
   if not api_key:
      # allow the library to pick up credentials from environment or application default
      try:
         return genai.Client()
      except Exception as e:
         raise RuntimeError("No GEMINI_API_KEY/GOOGLE_API_KEY found and automatic client init failed: " + str(e))

   try:
      return genai.Client(api_key=api_key)
   except TypeError:
      # older/newer client signatures may differ
      return genai.Client()


def translate_with_context(new_message: str, prev_messages: Optional[List[str]], target_language: str, model: str = "gemini-3-flash-preview") -> str:
   """Translate `new_message` into `target_language`, using up to 4 previous context messages.

   - prev_messages: list of up to 4 previous messages (older -> newer). Can be shorter or None.
   - Returns translated text as a string.
   """
   prev_messages = prev_messages or []
   # Keep only last 4 messages if more provided
   if len(prev_messages) > 4:
      prev_messages = prev_messages[-4:]

   context_block = "\n".join(f"- {m}" for m in prev_messages) if prev_messages else "(no prior messages)"

   prompt = (
      "You are a helpful translator assistant.\n"
      f"Previous messages (most recent last):\n{context_block}\n\n"
      f"Translate the following new message into {target_language}. Preserve meaning and tone.\n\n"
      f"Message:\n{new_message}\n\n"
      "Provide only the translated text, nothing else."
   )

   client = _get_client()

   try:
      response = client.models.generate_content(model=model, contents=prompt)
   except Exception as e:
      raise RuntimeError("API call failed: " + str(e))

   # Extract text from response in a robust way
   text = getattr(response, "text", None)
   if text:
      return text
   # some client versions return result or a dict-like object
   text = getattr(response, "result", None)
   if isinstance(text, str):
      return text
   try:
      return str(response)
   except Exception:
      return ""


def _cli_main():
   # Simple CLI for manual testing. Usage: python translator.py "new message" "lang" [prev1] [prev2] [prev3] [prev4]
   if len(sys.argv) < 3:
      print("Usage: python translator.py <new_message> <target_language> [prev1] [prev2] [prev3] [prev4]")
      sys.exit(1)

   new_message = sys.argv[1]
   target_language = sys.argv[2]
   prev_messages = sys.argv[3:7]

   try:
      translated = translate_with_context(new_message, prev_messages, target_language)
      print(translated)
   except Exception as e:
      print("Error:", e)
      sys.exit(2)


if __name__ == "__main__":
   _cli_main()