const DEFAULT_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/';

let runtimePromise = null;
let loaderPromise = null;
let executionQueue = Promise.resolve();
let flaskPromise = null;

function ensureLoader(indexURL) {
  if (typeof globalThis.loadPyodide === 'function') {
    return Promise.resolve();
  }

  if (typeof document === 'undefined') {
    return Promise.reject(new Error('The browser Python engine is unavailable.'));
  }

  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${indexURL}pyodide.js`;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (typeof globalThis.loadPyodide === 'function') {
          resolve();
        } else {
          reject(new Error('The browser Python engine did not initialize.'));
        }
      };
      script.onerror = () => reject(new Error('The browser Python engine could not be downloaded.'));
      document.head.appendChild(script);
    }).catch((error) => {
      loaderPromise = null;
      throw error;
    });
  }

  return loaderPromise;
}

async function loadRuntime(indexURL) {
  await ensureLoader(indexURL);

  if (!runtimePromise) {
    runtimePromise = globalThis.loadPyodide({ indexURL }).catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }

  return runtimePromise;
}

export class PyodideExecutor {
  constructor({ outputElement, execTimeElement, indexURL = DEFAULT_INDEX_URL } = {}) {
    this.outputElement = outputElement;
    this.execTimeElement = execTimeElement;
    this.indexURL = indexURL;
  }

  run(code = '') {
    // All editors share one runtime and its stdout, so serialize execution.
    const pending = executionQueue.then(() => this.execute(code));
    executionQueue = pending.catch(() => {});
    return pending;
  }

  async execute(code) {
    if (!this.outputElement) {
      throw new Error('PyodideExecutor requires an output element');
    }

    const startTime = Date.now();
    this.outputElement.textContent = '⏳ Loading Python in your browser...';
    if (this.execTimeElement) this.execTimeElement.textContent = '';

    let runtime;
    let executionError = null;
    let output = '';
    let namespace;

    try {
      runtime = await loadRuntime(this.indexURL);
      if (/^\s*(?:from\s+flask\b|import\s+flask\b)/m.test(code)) {
        this.outputElement.textContent = '⏳ Loading Flask for the route exercise...';
        if (!flaskPromise) {
          flaskPromise = (async () => {
            await runtime.loadPackage('micropip');
            await runtime.runPythonAsync('import micropip\nawait micropip.install("Flask==3.1.2")');
          })().catch(error => { flaskPromise = null; throw error; });
        }
        await flaskPromise;
      }
      this.outputElement.textContent = '⏳ Running...';

      // Each Run starts fresh, like the standalone homework submission.
      namespace = runtime.toPy({ __name__: '__main__' });

      runtime.runPython([
        'import sys',
        'from io import StringIO',
        '__runner_stdout, __runner_stderr = sys.stdout, sys.stderr',
        '__runner_output = StringIO()',
        'sys.stdout = __runner_output',
        'sys.stderr = __runner_output',
      ].join('\n'), { globals: namespace });

      try {
        await runtime.runPythonAsync(code, { globals: namespace });
      } catch (error) {
        executionError = error;
      }

      output = runtime.runPython('__runner_output.getvalue()', { globals: namespace });
    } catch (error) {
      executionError = error;
    } finally {
      if (runtime && namespace) {
        try {
          runtime.runPython('import sys\nsys.stdout = __runner_stdout\nsys.stderr = __runner_stderr', { globals: namespace });
        } catch (restoreError) {
          if (!executionError) executionError = restoreError;
        }
      }
      namespace?.destroy();
    }

    if (executionError) {
      const message = executionError.message || String(executionError);
      this.outputElement.textContent = output ? output + '\nError: ' + message : 'Error: ' + message;
      return;
    }

    this.outputElement.textContent = output || '[no output]';
    if (this.execTimeElement) {
      this.execTimeElement.textContent = `⏱ Execution time: ${Date.now() - startTime}ms (browser)`;
    }
  }
}

export default PyodideExecutor;
