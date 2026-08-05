import React from "react";

const Footer = () => {
  return (
    <footer className="px-2 w-full justify-between text-center text-xs text-slate-400 flex items-center mt-4">
      <div>
        <p>© {new Date().getFullYear()} Movie Tic-Tac-Toe. Made by Retard.</p>
      </div>

      <div className="flex sm:flex-row items-center justify-center gap-2 max-w-md opacity-70 hover:opacity-100 transition-opacity duration-300">
        <p className="text-xs text-slate-400">Powered by</p>
        <img src="/tmdb-logo.png" alt="TMDb Logo" className="w-12 h-auto" />
      </div>
    </footer>
  );
};

export default Footer;
