import starlette
import inspect
import os

print("Starlette version:", starlette.__version__)

from starlette.responses import FileResponse
print(inspect.getsource(FileResponse))
