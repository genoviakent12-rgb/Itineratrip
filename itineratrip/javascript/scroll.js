
//loads a separate HTML page into a section.
async function loadPage(file, sectionId) {
  const section = document.getElementById(sectionId); 

  try {
    const response = await fetch(file);
    const html = await response.text(); 
    const page = new DOMParser().parseFromString(html, "text/html");
    const content = page.querySelector("main");

    section.innerHTML = content.innerHTML;

    // Create icons after loading the page content.
    if (window.lucide) {
      lucide.createIcons();
    }

    const images = section.querySelectorAll("img");

    images.forEach((image) => {
      image.src = new URL(image.getAttribute("src"), response.url).href;
    });

    // calls the animateDestinations method on when destination page is on the screen 
    if (sectionId === "destinations-content") {
      animateDestinations();
    }
  } catch (error) {
    console.log("Error loading page:", error);
  }
}
// loads all screen when opening
document.addEventListener("DOMContentLoaded", () => {
  loadPage("pages/destinations.html", "destinations-content");
  loadPage("pages/how_it_works.html", "how-it-works-content");
  loadPage("pages/faq.html", "faq-content");
});
