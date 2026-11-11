"use client";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { customAlphabet } from "nanoid";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  markRoomJoined,
  saveRoomSettings,
  type RoomSettings,
} from "@/utils/roomSession";
<meta name="viewport" content="width=device-width, initial-scale=1.0" />;

const TIME_OPTIONS: {
  label: string;
  description: string;
  seconds: RoomSettings["turnSeconds"];
}[] = [
  { label: "Anti Cheat", description: "15s turns", seconds: 15 },
  { label: "Normal", description: "40s turns", seconds: 40 },
  { label: "Tactician", description: "60s turns", seconds: 60 },
  { label: "Unlimited", description: "No limit", seconds: null },
];

const ROUND_OPTIONS: {
  label: string;
  bestOf: RoomSettings["bestOf"];
}[] = [
  { label: "Best of 3", bestOf: 3 },
  { label: "Best of 5", bestOf: 5 },
  { label: "Best of 7", bestOf: 7 },
  { label: "Unlimited", bestOf: null },
];

const Room = () => {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nanoid = customAlphabet(alphabet, 6);
  const router = useRouter();
  const roomID = nanoid();
  const [code, setCode] = useState("");
  const [bestOf, setBestOf] = useState<RoomSettings["bestOf"]>(5);
  const [turnSeconds, setTurnSeconds] =
    useState<RoomSettings["turnSeconds"]>(40);

  const handleJoinRoom = () => {
    // Kodovi su velika slova i cifre, pa prihvatamo i "ab3k9z"
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) return;

    // Korisnik je sam kliknuo "Join", pa ulazi bez dodatnih provjera
    markRoomJoined(roomCode);
    router.push(`/room/${encodeURIComponent(roomCode)}`);
  };

  const handleCreateRoom = () => {
    // Kreator ulazi u sobu bez klika na "Join game"
    markRoomJoined(roomID);
    saveRoomSettings(roomID, { turnSeconds, bestOf });
    router.push(`/room/${roomID}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center  w-full max-w-4xl mx-auto">
        <div className="flex items-center gap-5 w-full sm:w-auto justify-center sm:justify-between bg-slate-800 p-4 rounded-md sm:gap-34 mb-8">
          <h2 className="text-xl sm:text-2xl">Rooms</h2>
          <div className="flex justify-center items-center gap-2">
            <input
              type="text"
              placeholder="ENTER CODE"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleJoinRoom();
              }}
              maxLength={6}
              className="bg-white py-2 px-4 sm:px-6 rounded-md border-2 border-blue-500 text-slate-800 font-bold uppercase"
            />
            <button
              onClick={handleJoinRoom}
              disabled={!code.trim()}
              className="rounded-md py-2 px-8 bg-blue-500 border-2 border-blue-500 cursor-pointer hover:bg-blue-700 hover:border-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join
            </button>
          </div>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:items-start justify-center bg-slate-800 rounded-md p-4">
          <div className="flex items-center justify-start mb-2">
            <h2 className="text-xl sm:text-2xl">Create Room: Settings</h2>
          </div>

          <div className="flex items-center justify-start mb-2">
            {ROUND_OPTIONS.map((option, index) => {
              const isSelected = bestOf === option.bestOf;
              const isFirst = index === 0;
              const isLast = index === ROUND_OPTIONS.length - 1;

              return (
                <div
                  key={option.label}
                  onClick={() => setBestOf(option.bestOf)}
                  className={`border pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer ${
                    isFirst ? "rounded-l-md" : ""
                  } ${isLast ? "rounded-r-md" : ""} ${
                    isSelected ? "bg-blue-500 border-blue-500" : "border-white"
                  }`}
                >
                  <p className="text-sm sm:text-base">{option.label}</p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-start mb-4">
            {TIME_OPTIONS.map((option, index) => {
              const isSelected = turnSeconds === option.seconds;
              const isFirst = index === 0;
              const isLast = index === TIME_OPTIONS.length - 1;

              return (
                <div
                  key={option.label}
                  onClick={() => setTurnSeconds(option.seconds)}
                  className={`border pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer ${
                    isFirst ? "rounded-l-md" : ""
                  } ${isLast ? "rounded-r-md" : ""} ${
                    isSelected ? "bg-blue-500 border-blue-500" : "border-white"
                  }`}
                >
                  <h4 className="text-sm sm:text-base">{option.label}</h4>
                  <p
                    className={`text-xs ${
                      isSelected ? "text-gray-200" : "text-gray-400"
                    }`}
                  >
                    {option.description}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-end w-full">
            <button
              className="rounded-md py-2 px-8 bg-blue-500 border-2 border-blue-500 cursor-pointer hover:bg-blue-700 hover:border-blue-700"
              onClick={() => handleCreateRoom()}
            >
              Create
            </button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Room;
