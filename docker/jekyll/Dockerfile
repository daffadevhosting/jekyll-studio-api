# Gunakan image Ruby resmi sebagai dasar
FROM ruby:3.1

# Instal dependensi yang dibutuhkan
RUN apt-get update -qq && apt-get install -y \
  build-essential \
  nodejs \
  npm \
  && rm -rf /var/lib/apt/lists/*

# Tetapkan direktori kerja di dalam kontainer
WORKDIR /workspace

# Instal Bundler untuk manajemen gem Ruby
RUN gem install bundler

# Salin Gemfile ke dalam kontainer (jika ada, jika tidak, Bundler akan membuatnya)
COPY Gemfile ./

# Instal dependensi gem Jekyll
RUN bundle install

# Salin sisa kode aplikasi
COPY . .

# Ekspos port default Jekyll dan LiveReload
EXPOSE 4000
EXPOSE 35729

# Perintah default untuk menjalankan server Jekyll
CMD ["bundle", "exec", "jekyll", "serve", "--host", "0.0.0.0", "--livereload"]
