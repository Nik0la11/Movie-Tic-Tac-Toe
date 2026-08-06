import { customAlphabet } from "nanoid";

const page = () => {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nanoid = customAlphabet(alphabet, 6);

  const generateRoomID = () => {
    return nanoid();
  };

  return <div>page</div>;
};

export default page;
