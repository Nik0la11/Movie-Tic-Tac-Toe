"use client";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { customAlphabet } from "nanoid";
import { useRouter } from "next/navigation";
import { useState } from "react";
<meta name="viewport" content="width=device-width, initial-scale=1.0" />;

const Room = () => {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nanoid = customAlphabet(alphabet, 6);
  const router = useRouter();
  const roomID = nanoid();
  const [code, setCode] = useState("");
  const [rounds, setRounds] = useState("");
  const [time, setTime] = useState("");

  const handleCreateRoom = () => {
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
              className="bg-white py-2 px-4 sm:px-6 rounded-md border-2 border-blue-500 text-slate-800 font-bold"
            />
            <button className="rounded-md py-2 px-8 bg-blue-500 border-2 border-blue-500 cursor-pointer hover:bg-blue-700 hover:border-blue-700">
              Join
            </button>
          </div>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:items-start justify-center bg-slate-800 rounded-md p-4">
          <div className="flex items-center justify-start mb-2">
            <h2 className="text-xl sm:text-2xl">Create Room: Settings</h2>
          </div>

          <div className="flex items-center justify-start mb-2">
            <div
              className={`rounded-l-md border border-white pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer ${
                rounds === "3" ? "bg-blue-500 border border-blue-500" : ""
              }`}
              onClick={() => setRounds("3")}
            >
              <p className="text-sm sm:text-base">Best of 3</p>
            </div>
            <div
              className="border pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 bg-blue-500 border-blue-500 cursor-pointer"
              onClick={() => setRounds("5")}
            >
              <p className="text-sm sm:text-base">Best of 5</p>
            </div>
            <div
              className="border-y-1 pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer"
              onClick={() => setRounds("7")}
            >
              <p className="text-sm sm:text-base">Best of 7</p>
            </div>
            <div
              className="rounded-r-md border border-white pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer"
              onClick={() => setRounds("u")}
            >
              <p className="text-sm sm:text-base">Unlimited</p>
            </div>
          </div>
          <div className="flex items-center justify-start mb-4">
            <div className="rounded-l-md border border-white pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer">
              <h4 className="text-sm sm:text-base">Anti Cheat</h4>
              <p className="text-gray-400 text-xs">15s turns</p>
            </div>
            <div className="border-y-1 border-r-1 pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 bg-blue-500 border-blue-500 cursor-pointer">
              <h4 className="text-sm sm:text-base">Normal</h4>
              <p className="text-gray-200 text-xs">40s turns</p>
            </div>
            <div className="border-y-1 pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer">
              <h4 className="text-sm sm:text-base">Tactician</h4>
              <p className="text-gray-400 text-xs">60s turns</p>
            </div>
            <div className="rounded-r-md border border-white pr-4 w-26 pl-2 sm:pr-12 py-2 sm:w-36 cursor-pointer">
              <h4 className="text-sm sm:text-base">Unlimited</h4>
              <p className="text-gray-400 text-xs">No limit</p>
            </div>
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
