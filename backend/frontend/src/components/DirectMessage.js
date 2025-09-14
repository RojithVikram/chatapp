// frontend/src/components/DirectMessages.js
import { useState, useEffect } from "react";

export default function DirectMessages({ socket, onlineUsers, currentUser }) {
  const [activeDM, setActiveDM] = useState(null); // userId of the DM target
  const [messages, setMessages] = useState([]);   // DM conversation
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState(null);

  useEffect(() => {
    if (!socket) return;

    // Listen for incoming DM
    socket.on("privateMessage", (msg) => {
      // Only add if relevant to current DM thread
      if (
        msg.fromUserId === activeDM ||
        msg.toUserId === activeDM
      ) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    // Listen for typing indicator in DM
    socket.on("typingDM", ({ fromUserId, fromUsername, isTyping }) => {
      if (activeDM === fromUserId && isTyping) {
        setTypingUser(fromUsername);
        setTimeout(() => setTypingUser(null), 2000); // auto-hide after 2s
      }
    });

    return () => {
      socket.off("privateMessage");
      socket.off("typingDM");
    };
  }, [socket, activeDM]);

  // Send a DM
  const sendDM = () => {
    if (!text.trim() || !activeDM) return;
    socket.emit("privateMessage", { toUserId: activeDM, text });
    setText("");
  };

  // Handle typing
  const handleTyping = (e) => {
    setText(e.target.value);
    if (activeDM) {
      socket.emit("typingDM", { toUserId: activeDM, isTyping: true });
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar with online users */}
      <div className="w-1/3 border-r p-2">
        <h2 className="font-bold mb-2">Online Users</h2>
        {onlineUsers
          .filter((u) => u.id !== currentUser.id) // don’t show self
          .map((u) => (
            <div
              key={u.id}
              className={`p-2 cursor-pointer rounded ${
                activeDM === u.id ? "bg-blue-200" : "hover:bg-gray-100"
              }`}
              onClick={() => {
                setActiveDM(u.id);
                setMessages([]); // clear old thread (or fetch history later)
              }}
            >
              {u.username}
            </div>
          ))}
      </div>

      {/* DM chat window */}
      <div className="flex-1 flex flex-col">
        {activeDM ? (
          <>
            <div className="flex-1 overflow-y-auto p-2">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`mb-2 ${
                    m.fromUserId === currentUser.id
                      ? "text-right"
                      : "text-left"
                  }`}
                >
                  <span className="inline-block bg-gray-200 p-2 rounded">
                    <strong>{m.fromUsername}: </strong>
                    {m.text}
                  </span>
                </div>
              ))}
              {typingUser && (
                <div className="italic text-sm text-gray-500">
                  {typingUser} is typing...
                </div>
              )}
            </div>

            <div className="p-2 border-t flex">
              <input
                type="text"
                value={text}
                onChange={handleTyping}
                placeholder="Type a DM..."
                className="flex-1 border rounded p-2 mr-2"
                onKeyDown={(e) => e.key === "Enter" && sendDM()}
              />
              <button
                onClick={sendDM}
                className="bg-blue-500 text-white px-4 py-2 rounded"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center flex-1">
            <p>Select a user to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
