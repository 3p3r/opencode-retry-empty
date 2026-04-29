# opencode-retry-empty

retries unexptected, successful, yet empty responses back from local models in opencode

## synopsis

This is a simple OpenCode plugin that retries a request if the response is empty, but the status code is 200. This can happen with local models that fail to generate a response, but still return a successful status code.

The plugin supports counting under a certain character threshold, which can be configured by the user. If the response is below the threshold, the plugin will retry the request up to a certain number of times.

The plugin is also configurable to allow users to set the maximum number of retries and the character threshold.
