# Introduction

Sometimes, recover files that have been deleted from the SSD/HDD could be potentialy broken or missing metadata for the system to read them correctly, leading to a potential broken file with no option to open or read whats insie...

Focusing on my forensic hobby, I decided to try developing some tools for file recovery, in this case focused on PSD files.

It's fully local, nothing is exposed online or needs any online tools/features.

**DISCLAIMER**

It's not a 100% success recovery tool, but it worked on a 70% of the cases I've tried to recover a file.

# Installatioan & Run Locally

**Prerequisites:**  Node.js

https://nodejs.org/en/download

## Step-by-Step:

### 1. Download and extract this project zip file to your local drive

<code>git clone https://github.com/Kitt004/PSD-File-Recovery-v0.1.git</code> <br>
<code>cd psd-corrupted-recovery</code>

### 2. Install required packages (Vite, React, Tailwind)

<code>npm install</code>

### 3. Boot local development server on localhost

<code>npm run dev</code>

### 4. Tool interface

<code>http://localhost:3000</code>
