<div align="center">
  <br/>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/lissy93/readme-themes/main/assets/images/dark/application-management-dashboard.png">
    <img alt="Showcase of the Minecraft Server GUI" width="800" src="https://raw.githubusercontent.com/lissy93/readme-themes/main/assets/images/light/application-management-dashboard.png">
  </picture>
  <br/>
  <br/>
  <h1>MineServerGUI</h1>
  <strong>Your All-in-One Dashboard for Effortless Minecraft Server Management</strong>
  <br/>
  <br/>
  <p>
    <a href="#"><img alt="Python" src="https://img.shields.io/badge/Python-3.7%2B-blue?style=for-the-badge&logo=python&logoColor=white"></a>
    <a href="#"><img alt="Flask" src="https://img.shields.io/badge/Flask-2.0%2B-black?style=for-the-badge&logo=flask&logoColor=white"></a>
    <a href="#"><img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES6-yellow?style=for-the-badge&logo=javascript&logoColor=black"></a>
    <a href="#"><img alt="Bootstrap" src="https://img.shields.io/badge/Bootstrap-5.3-purple?style=for-the-badge&logo=bootstrap&logoColor=white"></a>
  </p>
</div>

---

## 🌟 About The Project

Tired of wrestling with command lines and complex config files? **MineServerGUI** is here to revolutionize your Minecraft server management experience. Built for both beginners and seasoned administrators, this powerful web-based dashboard puts you in complete control through an intuitive, beautiful, and responsive interface.

Stop memorizing commands and start managing your servers visually.

<br/>

## ✨ Key Features

| Feature                      | Description                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 🎮 **One-Click Creation**     | Spin up new servers in seconds. Choose from Paper, Purpur, Fabric, Forge, and more with just a few clicks.                               |
| 📋 **Server Templates**      | Save and reuse server configurations. Create templates from existing servers, share them via JSON export/import, and deploy multiple identical servers instantly. |
| 📊 **Real-Time Dashboard**   | Monitor all your servers at a glance. Live status, player counts, and resource usage keep you informed.                                    |
| 🔌 **Plugin/Mod Manager**    | Browse and install plugins/mods from Modrinth with one click. Automatically detects server type and shows compatible add-ons.             |
| 🌍 **World Management**      | Upload, download, and manage world folders. Download worlds as ZIP, upload new worlds, and reset Nether/End dimensions with built-in backups. |
| 🛠️ **Advanced Script Editor** | Visually manage your installation and startup scripts. Reorder, edit, and delete commands with an intuitive drag-and-drop style UI.      |
| 📂 **In-Browser File Explorer** | No more FTP! Manage server files directly from the browser. Upload, download, rename, and edit files on the fly.                        |
| ⌨️ **Live Console & Logs**   | View live server logs and send commands directly to your running server through the integrated terminal.                                     |
| 👥 **Player Management**     | Manage whitelist and operators with player head previews. Add players by username with automatic UUID lookup via Mojang API.              |
| 📈 **Server Analytics**      | Track player activity, session history, playtime statistics, and peak hours. Monitor server performance and player engagement over time.   |
| ⚙️ **Effortless Configuration**| Manage server ports, EULA, and other settings through the UI. Includes automatic port-conflict detection to prevent headaches.        |
| 🎨 **Modern & Responsive UI** | A clean, dark-themed interface built with Bootstrap and SweetAlert2 makes managing servers a pleasure on any device.                      |

<br/>

## 🚀 Getting Started

Ready to take control? Follow these simple steps to get MineServerGUI up and running.

### Prerequisites

-   **Python**: Version 3.7 or higher.
-   **Backend Dependencies**: All required packages are listed in `backend/requirements.txt`.
-   **(Windows Users)**: **Windows Subsystem for Linux (WSL)** is highly recommended. The server management backend relies on `screen` for session management, which is not natively available on Windows.

### Installation & Launch

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/SchroederBrian/MineServerGUI
    cd MineServerGUI
    ```

2.  **Set Up the Backend (ONLY LINUX):**
    ```bash
    cd backend
    
    # (Recommended) Create and activate a virtual environment
    python -m venv venv
    source venv/bin/activate # On Windows: venv\Scripts\activate
    
    # Install dependencies
    pip install -r requirements.txt
    ```

3.  **Run the Server:**
    ```bash
    flask run
    ```
    The backend will start, typically on `http://127.0.0.1:5000`.

4.  **Launch the Frontend:**
    -   Navigate back to the root directory of the project.
    -   Open the `index.html` file directly in your web browser.

That's it! You should now see the dashboard and can begin creating and managing your Minecraft servers.

<br/>

## 🛠️ Tech Stack

This project is built with a modern and robust set of technologies:

<p>
  <a href="#"><img alt="Python" src="https://img.shields.io/badge/Python-3.7%2B-blue?style=flat-square&logo=python&logoColor=white"></a>
  <a href="#"><img alt="Flask" src="https://img.shields.io/badge/Flask-2.0%2B-black?style=flat-square&logo=flask&logoColor=white"></a>
  <a href="#"><img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES6-yellow?style=flat-square&logo=javascript&logoColor=black"></a>
  <a href="#"><img alt="Bootstrap" src="https://img.shields.io/badge/Bootstrap-5.3-purple?style=flat-square&logo=bootstrap&logoColor=white"></a>
  <a href="#"><img alt="SweetAlert2" src="https://img.shields.io/badge/SweetAlert2-11.0-red?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBmaWxsPSIjRkZGIiBkPSJNMjUsMSBDMTIuMywxIDIsMTIuMyAyLDI1IEMyLDM3LjcgMTIuMyw0OCAyNSw0OCBDMzcuNyw0OCA0OCwzNy43IDQ4LDI1IEM0OCwxMi4zIDM3LjcsMSAyNSwxIFogTTM0LjIsMzIuMyBDMzUuMSwzMy4yIDM1LjEsMzQuNyAzNC4yLDM1LjYgQzMzLjcsMzYgMzMuMiwzNi4zIDMyLjcsMzYuMyBDMzIuMiwzNi4zIDMxLjcsMzYgMzEuMywzNS42IEwyNSwyOS4zIEwxOC43LDM1LjYgQzE4LjMsMzYgMTcuOCwzNi4zIDE3LjMsMzYuMyBDMTYuOCwzNi4zIDE2LjMsMzYgMTUuOCwzNS42IEMxNC45LDM0LjcgMTQuOSwzMy4yIDE1LjgsMzIuMyBMMjIuMiwzNS42IEwxNS44LDE3LjcgQzE0LjksMTYuOCAxNC45LDE1LjMgMTUuOCwxNC40IEMxNi43LDEzLjUgMTguMiwxMy41IDE5LjEsMTQuNCBMMjUsMjAuNyBMMzAuOSwxNC40IEMzMS44LDEzLjUgMzMuMywxMy41IDM0LjIsMTQuNCBDMzUuMSwxNS4zIDM1LjEsMTYuOCAzNC4yLDE3LjcgTDI3LjgsMjUgTDM0LjIsMzIuMyBaIi8+PC9zdmc+"></a>
  <a href="#"><img alt="Font Awesome" src="https://img.shields.io/badge/Font_Awesome-6.0-blue?style=flat-square&logo=font-awesome&logoColor=white"></a>
</p>

-   **Backend**: Python with Flask
-   **Frontend**: Vanilla JavaScript (ES6+), Bootstrap 5, SweetAlert2, Font Awesome
-   **Server Management**: `screen` (on Linux/WSL)

---

## 🙌 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

<br/>

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
(Note: You'll need to add a `LICENSE` file if you don't have one). 
