# Solar-Terrestrial HF propagation Data for eInk displays

Displays solar-terrestrial HF propagation data as an image (or html canvas) for eInk displays. The data is sourced from `https://www.hamqsl.com/solarxml.php`.

The server can be run using Docker. After building the image and starting the containers with `run.sh`, the following endpoints are available:

## Endpoints

*   **/solar/json**: Returns the solar-terrestrial data in JSON format.
*   **/solar/canvas**: Returns an HTML document with a server-side rendered canvas displaying the solar-terrestrial data.
*   **/solar/png**: Returns the server-side rendered canvas directly as a PNG image.

## Running the Server

1.  **Build the Docker image and start the server:**
    ```bash
    ./run.sh
    ```
2.  **Access the server:**
    The server will be available at `http://localhost:3000`.

## Stopping the Server

To stop the running Docker containers, use the following command:
```bash
docker-compose down