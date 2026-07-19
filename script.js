const form = document.querySelector("#appointmentForm");
const dateInput = document.querySelector("#date");

const successModal = document.querySelector("#successModal");
const closeModalBtn = document.querySelector("#closeModalBtn");
const modalBackdrop = document.querySelector("#successModal .modal-backdrop");

const summaryName = document.querySelector("#summaryName");
const summaryFacility = document.querySelector("#summaryFacility");
const summaryService = document.querySelector("#summaryService");
const summaryDateTime = document.querySelector("#summaryDateTime");
const summaryPhone = document.querySelector("#summaryPhone");

dateInput.min = new Date().toISOString().split("T")[0];

function validateField(input) {
  const fieldContainer = input.closest(".field");
  if (!fieldContainer) return true;
  
  const errorSpan = fieldContainer.querySelector(".error-text");
  let isValid = true;
  let errorMessage = "";

  if (input.required && !input.value.trim()) {
    isValid = false;
    errorMessage = "This field is required.";
  } else {
    if (input.id === "fullName" && input.value.trim().length < 3) {
      isValid = false;
      errorMessage = "Name must be at least 3 characters long.";
    } else if (input.id === "phone") {
      const phoneClean = input.value.replace(/[\s()+-]/g, "");
      if (phoneClean.length < 8 || !/^\d+$/.test(phoneClean)) {
        isValid = false;
        errorMessage = "Please enter a valid phone number (at least 8 digits).";
      }
    } else if (input.id === "date") {
      const todayStr = new Date().toISOString().split("T")[0];
      if (input.value < todayStr) {
        isValid = false;
        errorMessage = "Preferred date cannot be in the past.";
      }
    } else if (input.id === "reason" && input.value.trim().length < 10) {
      isValid = false;
      errorMessage = "Please describe what you need help with (min. 10 characters).";
    }
  }

  if (isValid) {
    fieldContainer.classList.remove("invalid");
    fieldContainer.classList.add("valid");
    if (errorSpan) errorSpan.textContent = "";
  } else {
    fieldContainer.classList.remove("valid");
    fieldContainer.classList.add("invalid");
    if (errorSpan) errorSpan.textContent = errorMessage;
  }

  return isValid;
}

const inputs = form.querySelectorAll("input, select, textarea");
inputs.forEach(input => {
  input.addEventListener("blur", () => validateField(input));
  input.addEventListener("input", () => {
    const fieldContainer = input.closest(".field");
    if (fieldContainer && fieldContainer.classList.contains("invalid")) {
      validateField(input);
    }
  });
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  
  let formIsValid = true;
  inputs.forEach(input => {
    if (!validateField(input)) {
      formIsValid = false;
    }
  });

  if (!formIsValid) {
    const firstInvalid = form.querySelector(".field.invalid input, .field.invalid select, .field.invalid textarea");
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  const fullNameVal = document.querySelector("#fullName").value;
  const facilityVal = document.querySelector("#facility").value;
  const serviceVal = document.querySelector("#service").value;
  const dateVal = document.querySelector("#date").value;
  const timeVal = document.querySelector("#time").value;
  const phoneVal = document.querySelector("#phone").value;

  summaryName.textContent = fullNameVal;
  summaryFacility.textContent = facilityVal;
  summaryService.textContent = serviceVal;
  summaryPhone.textContent = phoneVal;

  try {
    const dateObj = new Date(dateVal);
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    summaryDateTime.textContent = `${formattedDate} at ${timeVal}`;
  } catch (e) {
    summaryDateTime.textContent = `${dateVal} at ${timeVal}`;
  }

  successModal.removeAttribute("hidden");

  form.reset();
  inputs.forEach(input => {
    const fieldContainer = input.closest(".field");
    if (fieldContainer) {
      fieldContainer.classList.remove("valid", "invalid");
    }
  });

  dateInput.min = new Date().toISOString().split("T")[0];
});

function closeModal() {
  successModal.setAttribute("hidden", "true");
}

closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", closeModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !successModal.hasAttribute("hidden")) {
    closeModal();
  }
});

