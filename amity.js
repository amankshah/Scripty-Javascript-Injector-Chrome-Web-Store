try {
  const navItem = document.querySelector("#region-main .navitem");
  if (navItem) {
    navItem.innerHTML += '<button id="newCopy" class="btn btn-secondary">Copy</button>';
  } else {
    console.warn("Element '#region-main .navitem' not found.");
  }
} catch (error) {
  console.error("Error modifying nav item:", error);
}

try {
  const questions = document.querySelector("#responseform");

  if (!questions) {
    console.warn("Element '#responseform' not found.");
    return;
  }

  // Delay lookup of #newCopy to ensure it's added to the DOM
  setTimeout(() => {
    const copyButton = document.querySelector("#newCopy");

    if (!copyButton) {
      console.warn("Button with ID 'newCopy' not found.");
      return;
    }

    copyButton.addEventListener("click", () => {
      try {
        const tempTextarea = document.createElement("textarea");
        tempTextarea.value = questions.innerText;
        document.body.appendChild(tempTextarea);

        tempTextarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(tempTextarea);

        if (success) {
          copyButton.innerText = "Copied";
          setTimeout(() => {
            copyButton.innerText = "Copy";
          }, 500);
        } else {
          alert("Failed to copy text.");
        }
      } catch (copyError) {
        console.error("Error during copy operation:", copyError);
        alert("An error occurred while copying.");
      }
    });
  }, 0);
} catch (eventError) {
  console.error("Error setting up event listeners:", eventError);
}
