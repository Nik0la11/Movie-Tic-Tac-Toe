import Header from "../components/Header";
import Footer from "../components/Footer";

const Room = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex items-center justify-between bg-slate-800 p-4 rounded-md gap-34 mb-8">
          <h2 className="text-2xl">Rooms</h2>
          <div className="flex justify-center items-center gap-2">
            <input
              type="text"
              className="bg-white py-2 px-8 rounded-md border-2 border-blue-500"
            />
            <button className="rounded-md py-2 px-8 bg-blue-500 border-2 border-blue-500">
              Join
            </button>
          </div>
        </div>
        <div className="flex flex-col items-start justify-center bg-slate-800 rounded-md p-4">
          <div className="flex items-center justify-start mb-2">
            <h2 className="text-2xl">Create Room: Settings</h2>
          </div>

          <div className="flex items-center justify-center mb-2">
            <div className="rounded-l-md border border-white pl-2 pr-12 py-2 w-36">
              Best of 3
            </div>
            <div className="border-y-1 border-r-1 pl-2 pr-12 py-2 w-36">
              Best of 5
            </div>
            <div className="border-y-1 pl-2 pr-12 py-2 w-36">Best of 7</div>
            <div className="rounded-r-md border border-white pl-2 pr-12 py-2 w-36">
              Unlimited
            </div>
          </div>
          <div className="flex items-center justify-center mb-4">
            <div className="rounded-l-md border border-white pl-2 pr-12 py-2 w-36">
              <h4>Anti Cheat</h4>
              <p className="text-gray-400 text-xs">15s turns</p>
            </div>
            <div className="border-y-1 border-r-1 pl-2 pr-12 py-2 w-36">
              <h4>Normal</h4>
              <p className="text-gray-400 text-xs">40s turns</p>
            </div>
            <div className="border-y-1 pl-2 pr-12 py-2 w-36">
              <h4>Tactician</h4>
              <p className="text-gray-400 text-xs">60s turns</p>
            </div>
            <div className="rounded-r-md border border-white pl-2 pr-12 py-2 w-36">
              <h4>Unlimited</h4>
              <p className="text-gray-400 text-xs">No limit</p>
            </div>
          </div>
          <div className="flex items-center justify-end w-full">
            <button className="rounded-md py-2 px-8 bg-blue-500 border-2 border-blue-500 ">
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
