
# Portfolio - tooReal

This repository contains my personal portfolio website (tooReal) - a collection of static pages showcasing projects, CV, and other information. One of the included projects is Wordle.

The site is a simple static site (HTML/CSS/JS) and can be viewed by opening the HTML files in a browser or serving the folder with a static server.

Quick links
- `index.html` - portfolio homepage
- `about.html` - about / contact
- `projects.html` - projects overview
- `cv.html` - a CV page
- `wordle.html` - the Wordle project

Project structure

```
tooReal/
  index.html
  about.html
  projects.html
  cv.html
  css/
    style.css
  js/
    main.js
  assets/
    images/
    cv/
```

Wordle is included as `wordle.html` with supporting CSS (`css/wordle.css`) and JavaScript (`js/wordle.js`) and contains two modes:

- Play mode: play Wordle-style rounds using the full English NYT word list.
- Solve mode: helper mode to narrow down possible words given feedback.
