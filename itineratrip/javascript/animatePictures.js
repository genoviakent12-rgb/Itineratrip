// pictures will move automatically without scrolling
function animateDestinations() {
  const destinationList = document.querySelector(
    "#destinations-content .list"
  );
  if (!destinationList) return;
  // fetch the pictures and copy 
  const originalCards = Array.from(destinationList.children);
  originalCards.forEach((card) => {
    const copy = card.cloneNode(true);
    destinationList.appendChild(copy);
  });
  // places all pictures in one row
  destinationList.style.display = "flex";
  destinationList.style.width = "max-content";
  destinationList.style.flexWrap = "nowrap";
  destinationList.style.overflow = "visible";

  let position = 0;

  // method to make pictures move
  function movePictures() {
    position += 0.5;
    const halfway = destinationList.scrollWidth / 2; 
    // restarts when done
    if (position >= halfway) {
      position = 0;
    }
    destinationList.style.transform = `translateX(-${position}px)`;
    requestAnimationFrame(movePictures);
  }
  movePictures();
}