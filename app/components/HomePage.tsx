"use client";

import { useRouter } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";

const HomePage = () => {
  const router = useRouter();

  const handleSinglePlayer = () => {
    router.push("/singleplayer");
  };

  const handleMultiPlayer = () => {
    router.push("/room");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <Header />
      <div className="flex-1 flex items-center justify-center gap-4 ">
        <div>
          <button
            className="px-6 py-3 bg-green-600 cursor-pointer hover:bg-green-500 rounded-lg font-bold transition-colors"
            onClick={() => handleMultiPlayer()}
          >
            Multiplayer
          </button>
        </div>

        <div>
          <button
            className="px-6 py-3 bg-red-600 cursor-pointer hover:bg-red-500 rounded-lg font-bold transition-colors"
            onClick={() => handleSinglePlayer()}
          >
            Singleplayer
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default HomePage;
